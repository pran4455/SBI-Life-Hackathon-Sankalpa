#!/usr/bin/env python3
import sys
import json
from trust_policy import PolicyClassifierAndTrustCalculator

def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python policy_classifier.py '<json_data>'")
        
        # Parse input data
        input_data = json.loads(sys.argv[1])
        policy_name = input_data.get('policy_name', '')
        policy_description = input_data.get('policy_description', '')
        user_profile = input_data.get('user_profile', {})
        
        # Initialize classifier
        classifier = PolicyClassifierAndTrustCalculator()
        
        # Get enhanced trust scores
        result = classifier.get_enhanced_trust_scores(
            policy_name=policy_name,
            policy_description=policy_description,
            user_profile=user_profile
        )
        
        # Output result as JSON
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            'error': str(e),
            'policy_type': 'Unknown',
            'transparency_score': 0.5,
            'suitability_score': 0.5,
            'financial_safety_score': 0.5,
            'compliance_score': 0.5
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()
