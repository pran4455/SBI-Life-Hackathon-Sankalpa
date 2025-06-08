import joblib
import sklearn
import sys
import os

try:
    print(f"Current scikit-learn version: {sklearn.__version__}")
    
    model_path = os.path.join('model_upsell', 'upsell_ensemble_model.pkl')
    print(f"\nAttempting to load model from: {model_path}")
    
    if not os.path.exists(model_path):
        print(f"Error: Model file not found at {model_path}")
        sys.exit(1)
        
    model = joblib.load(model_path)
    print("\nModel loaded successfully!")
    
    # Try to get model's sklearn version if available
    if hasattr(model, '_sklearn_version'):
        print(f"\nModel was trained with scikit-learn version: {model._sklearn_version}")
    else:
        print("\nCouldn't determine model's training sklearn version")
    
    # Print model components
    print("\nModel pipeline components:")
    if hasattr(model, 'named_steps'):
        for name, step in model.named_steps.items():
            print(f"- {name}: {type(step).__name__}")
            
except Exception as e:
    print(f"\nError: {str(e)}", file=sys.stderr)
    raise
