# This is chabot_server.py

from flask import Flask, request, jsonify
from flask_cors import CORS
from ctransformers import AutoModelForCausalLM
import re
import threading
import time

app = Flask(__name__)
CORS(app)

# Global model variable
llm = None
model_loaded = False

def load_model():
    """Load the model in a separate thread"""
    global llm, model_loaded
    try:
        print("Loading model...")
        llm = AutoModelForCausalLM.from_pretrained(
            "zoltanctoth/orca_mini_3B-GGUF",
            model_file="orca-mini-3b.q4_0.gguf",
            max_new_tokens=512,
            temperature=0.7
        )
        model_loaded = True
        print("Model loaded successfully!")
    except Exception as e:
        print(f"Error loading model: {e}")
        model_loaded = False

def preprocess_text(text: str) -> str:
    """Clean and preprocess text for better model handling."""
    text = re.sub(r"[^a-zA-Z0-9.,!?'\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def get_prompt(instruction: str, history: list = None) -> str:
    """Generate a prompt for the model."""
    system = "You are FinChat, a helpful financial assistant AI. You provide practical advice about savings, investments, loans, insurance, budgeting, and general money matters. Keep your responses helpful, concise, and friendly."
    
    prompt = f"### System:\n{system}\n\n"
    
    if history and len(history) > 0:
        prompt += "### Previous conversation:\n"
        for i, msg in enumerate(history[-4:]):  # Last 4 messages
            role = "User" if i % 2 == 0 else "Assistant"
            prompt += f"{role}: {msg}\n"
        prompt += "\n"
    
    prompt += f"### User:\n{instruction}\n\n### Assistant:\n"
    return prompt

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'message': 'FinChat API Server',
        'status': 'running',
        'model_loaded': model_loaded,
        'endpoints': {
            'health': '/health',
            'chat': '/chat',
            'stream': '/chat/stream'
        }
    })

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'model_loaded': model_loaded
    })

@app.route('/chat', methods=['POST'])
def chat():
    global llm, model_loaded
    
    if not model_loaded:
        return jsonify({
            'error': 'Model is still loading. Please try again in a moment.',
            'model_loaded': False
        }), 503
    
    try:
        data = request.json
        message = data.get('message', '').strip()
        history = data.get('history', [])
        
        if not message:
            return jsonify({'error': 'No message provided'}), 400
        
        # Preprocess the message
        message = preprocess_text(message)
        
        # Generate prompt
        prompt = get_prompt(message, history)
        
        print(f"Received message: {message}")
        print(f"Generated prompt: {prompt[:200]}...")
        
        # Generate response
        response = llm(prompt, max_new_tokens=200, temperature=0.7, top_p=0.9)
        
        # Clean up response
        if "### Assistant:" in response:
            response = response.split("### Assistant:")[-1].strip()
        if "### User:" in response:
            response = response.split("### User:")[0].strip()
        
        # Remove any remaining system prompts
        response = re.sub(r'### \w+:', '', response).strip()
        
        print(f"Generated response: {response}")
        
        return jsonify({
            'response': response,
            'model_loaded': True
        })
        
    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        return jsonify({
            'error': 'I apologize, but I encountered an error processing your request. Please try again.',
            'details': str(e)
        }), 500

@app.route('/chat/stream', methods=['POST'])
def chat_stream():
    global llm, model_loaded
    
    if not model_loaded:
        return jsonify({
            'error': 'Model is still loading. Please try again in a moment.',
            'model_loaded': False
        }), 503
    
    try:
        data = request.json
        message = data.get('message', '').strip()
        history = data.get('history', [])
        
        if not message:
            return jsonify({'error': 'No message provided'}), 400
        
        # Preprocess the message
        message = preprocess_text(message)
        
        # Generate prompt
        prompt = get_prompt(message, history)
        
        print(f"Received message: {message}")
        
        def generate():
            try:
                response_text = ""
                for token in llm(prompt, max_new_tokens=200, temperature=0.7, top_p=0.9, stream=True):
                    # Clean token
                    if "### Assistant:" in token:
                        token = token.split("### Assistant:")[-1]
                    if "### User:" in token:
                        token = token.split("### User:")[0]
                    
                    # Remove system prompts
                    token = re.sub(r'### \w+:', '', token)
                    
                    if token.strip():
                        response_text += token
                        yield f"data: {token}\n\n"
                
                yield "data: [DONE]\n\n"
                print(f"Complete response: {response_text}")
                
            except Exception as e:
                print(f"Error in streaming: {e}")
                yield f"data: [ERROR]\n\n"
        
        return app.response_class(
            generate(),
            mimetype='text/plain',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            }
        )
        
    except Exception as e:
        print(f"Error in chat stream endpoint: {e}")
        return jsonify({
            'error': 'I apologize, but I encountered an error processing your request.',
            'details': str(e)
        }), 500
    
if __name__ == '__main__':
    # Start model loading in background
    model_thread = threading.Thread(target=load_model)
    model_thread.daemon = True
    model_thread.start()
    
    # Start Flask server
    app.run(host='0.0.0.0', port=8001, debug=False)
