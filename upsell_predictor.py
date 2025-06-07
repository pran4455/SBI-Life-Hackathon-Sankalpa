#This is upsell_predictor.py

import sys
import json
import joblib
import pandas as pd
import numpy as np
import os
import traceback

def load_model():
    """Load the upselling model"""
    try:
        model_path = os.path.join(os.path.dirname(__file__), 'model_upsell', 'upsell_ensemble_model.pkl')
        
        if os.path.exists(model_path):
            pipeline = joblib.load(model_path)
            return pipeline
        else:
            raise FileNotFoundError(f"Model file not found at: {model_path}")
    except Exception as e:
        raise Exception(f"Failed to load model: {str(e)}")

def prepare_data_for_prediction(user_data):
    """Prepare user data for model prediction"""
    try:
        # Define the expected column order for the model
        expected_columns = ['CreditScore', 'Geography', 'Gender', 'Age', 'Tenure', 'Balance', 
                           'NumOfProducts', 'HasCrCard', 'IsActiveMember', 'EstimatedSalary', 'Exited']
        
        # Map user data to model format
        model_data = {
            'CreditScore': int(user_data.get('CreditScore', 600)),
            'Geography': str(user_data.get('Geography', 'France')),
            'Gender': str(user_data.get('Gender', 'Male')),
            'Age': int(user_data.get('Age', 30)),
            'Tenure': int(user_data.get('Tenure', 5)),
            'Balance': float(user_data.get('Balance', 50000)),
            'NumOfProducts': int(user_data.get('NumOfProducts', 2)),
            'HasCrCard': int(user_data.get('HasCrCard', 0)),
            'IsActiveMember': int(user_data.get('IsActiveMember', 1)),
            'EstimatedSalary': float(user_data.get('EstimatedSalary', 100000)),
            'Exited': int(user_data.get('Exited', 0))
        }
        
        # Create DataFrame with expected column order
        df = pd.DataFrame([model_data], columns=expected_columns)
        
        return df
        
    except Exception as e:
        raise Exception(f"Data preparation error: {str(e)}")

def make_upselling_prediction(user_data):
    """Make upselling prediction for user using ML model only"""
    try:
        # Load model (required - no fallback)
        pipeline = load_model()
        
        # Prepare data for prediction
        df = prepare_data_for_prediction(user_data)
        
        # Make prediction
        raw_prediction = pipeline.predict(df)
        
        # Ensure we get a numeric prediction
        if isinstance(raw_prediction, np.ndarray):
            if raw_prediction.dtype.kind in 'fc':  # float or complex
                prediction_class = int(raw_prediction[0])
            elif raw_prediction.dtype.kind in 'iu':  # integer or unsigned integer
                prediction_class = int(raw_prediction[0])
            else:
                # Handle string predictions - extract numeric part or map to category
                pred_str = str(raw_prediction[0])
                # Try to find category mapping based on string content
                if 'cross-sell' in pred_str.lower() or 'savings' in pred_str.lower():
                    prediction_class = 0
                elif 'engagement' in pred_str.lower() or 'early tenure' in pred_str.lower():
                    prediction_class = 1
                elif 'general offer' in pred_str.lower():
                    prediction_class = 2
                elif 'long-tenured' in pred_str.lower() or 'premium' in pred_str.lower():
                    prediction_class = 3
                elif 'mid-term' in pred_str.lower() or 'insurance' in pred_str.lower():
                    prediction_class = 4
                elif 'investment' in pred_str.lower() or 'wealth' in pred_str.lower():
                    prediction_class = 5
                elif 'retention' in pred_str.lower():
                    prediction_class = 6
                else:
                    prediction_class = 2  # default to general offer
        else:
            # Handle single value prediction
            if isinstance(raw_prediction, (int, np.integer)):
                prediction_class = int(raw_prediction)
            elif isinstance(raw_prediction, (float, np.floating)):
                prediction_class = int(raw_prediction)
            else:
                # String prediction - map to category
                pred_str = str(raw_prediction)
                if 'cross-sell' in pred_str.lower() or 'savings' in pred_str.lower():
                    prediction_class = 0
                elif 'engagement' in pred_str.lower() or 'early tenure' in pred_str.lower():
                    prediction_class = 1
                elif 'general offer' in pred_str.lower():
                    prediction_class = 2
                elif 'long-tenured' in pred_str.lower() or 'premium' in pred_str.lower():
                    prediction_class = 3
                elif 'mid-term' in pred_str.lower() or 'insurance' in pred_str.lower():
                    prediction_class = 4
                elif 'investment' in pred_str.lower() or 'wealth' in pred_str.lower():
                    prediction_class = 5
                elif 'retention' in pred_str.lower():
                    prediction_class = 6
                else:
                    prediction_class = 2  # default to general offer
        
        # Get prediction probabilities
        try:
            prediction_proba = pipeline.predict_proba(df)
            probabilities = prediction_proba[0].tolist() if len(prediction_proba) > 0 else []
        except:
            # If predict_proba fails, create dummy probabilities based on prediction
            probabilities = [0.0] * 7
            probabilities[prediction_class] = 1.0
        
        if not probabilities:
            raise Exception("Model failed to generate prediction probabilities")
        
        # Recommendations mapping based on model classes
        recommendations_mapping = {
            0: 'Cross-sell opportunity: Suggest savings or credit products with low fees',
            1: 'Engagement incentive: Personalized offers or loyalty points for early tenure engagement',
            2: 'General offer: Reward program or tailored financial review',
            3: 'Long-tenured customer: Recommend premium financial products or exclusive memberships',
            4: 'Mid-term tenure: Suggest insurance, fixed deposits, or personal loans with incentives',
            5: 'Premium policy offer: Investment or wealth management plans',
            6: 'Retention offer: Special cashback or reduced fees to retain the customer'
        }
        
        # Create recommendations with confidence
        recommendations_with_confidence = []
        for i in range(len(probabilities)):
            if i in recommendations_mapping:
                recommendations_with_confidence.append({
                    'recommendation': recommendations_mapping[i],
                    'confidence': f"{(probabilities[i] * 100):.2f}%",
                    'confidence_raw': probabilities[i],
                    'probability': probabilities[i],
                    'id': i,
                    'category_id': i
                })
        
        # Sort recommendations by confidence (descending)
        recommendations_with_confidence.sort(key=lambda x: x['probability'], reverse=True)
        
        # Prepare customer data for display
        customer_data = {
            'CreditScore': user_data.get('CreditScore'),
            'Geography': user_data.get('Geography'),
            'Gender': user_data.get('Gender'),
            'Age': user_data.get('Age'),
            'Tenure': user_data.get('Tenure'),
            'Balance': user_data.get('Balance'),
            'NumOfProducts': user_data.get('NumOfProducts'),
            'HasCrCard': 'Yes' if user_data.get('HasCrCard') else 'No',
            'IsActiveMember': 'Yes' if user_data.get('IsActiveMember') else 'No',
            'EstimatedSalary': user_data.get('EstimatedSalary'),
            'Exited': 'Yes' if user_data.get('Exited') else 'No'
        }
        
        result = {
            "success": True,
            "upselling_recommendations": recommendations_with_confidence,
            "prediction_class": prediction_class,
            "churn_probability": probabilities[prediction_class] if prediction_class < len(probabilities) else 0.0,
            "user_profile": user_data,
            "user_profile_summary": {
                "age": user_data.get('Age'),
                "salary": user_data.get('EstimatedSalary'),
                "credit_score": user_data.get('CreditScore'),
                "geography": user_data.get('Geography'),
                "products_count": user_data.get('NumOfProducts'),
                "tenure": user_data.get('Tenure')
            },
            "customer_data": customer_data,
            "top_prediction": prediction_class,
            "model_predictions": {
                "raw_prediction": prediction_class,
                "probabilities": probabilities,
                "model_loaded": True
            }
        }
        
        return result
        
    except Exception as e:
        return {
            "success": False,
            "error": f"ML Prediction error: {str(e)}",
            "traceback": traceback.format_exc(),
            "model_loaded": False
        }

def main():
    try:
        # Read input data from command line arguments or stdin
        if len(sys.argv) > 1:
            input_data = json.loads(sys.argv[1])
        else:
            input_data = json.loads(sys.stdin.read())
        
        # Validate required input data
        required_fields = ['CreditScore', 'Geography', 'Gender', 'Age', 'Tenure', 'Balance', 
                          'NumOfProducts', 'HasCrCard', 'IsActiveMember', 'EstimatedSalary']
        
        missing_fields = [field for field in required_fields if field not in input_data]
        if missing_fields:
            raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")
        
        # Make upselling prediction using ML model only
        result = make_upselling_prediction(input_data)
        
        # Output result
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": f"Script error: {str(e)}",
            "traceback": traceback.format_exc(),
            "model_loaded": False,
            "required_fields": ['CreditScore', 'Geography', 'Gender', 'Age', 'Tenure', 'Balance', 
                               'NumOfProducts', 'HasCrCard', 'IsActiveMember', 'EstimatedSalary']
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()
