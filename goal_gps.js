const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI('AIzaSyBFGhAb2xXDJRNPfwXSEBi4KpSDSBPb7ow'); // Replace with your actual API key

async function getGoalRecommendation(goal, duration, risk) {
    try {
        // Read SBI Life insurance schemes data
        const schemesPath = path.join(__dirname, 'sbi_life_schemes.txt');
        let schemesData = '';
        
        try {
            schemesData = fs.readFileSync(schemesPath, 'utf8');
        } catch (fileError) {
            console.log('SBI schemes file not found, proceeding without it');
            schemesData = 'No specific insurance schemes data available.';
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        const prompt = `
You are a financial advisor analyzing whether a financial goal is achievable using SBI Life insurance schemes.

User's Financial Goal:
- Goal: ${goal}
- Duration: ${duration} months
- Risk Appetite: ${risk}

Available SBI Life Insurance Schemes:
${schemesData}

Please analyze if this goal is achievable with the available schemes and provide a recommendation.

Your response must be in this exact JSON format:
{
  "color": "Green|Yellow|Red",
  "reason": "Detailed explanation of why the goal is achievable or not, including specific recommendations and alternative suggestions if needed."
}

Color Guidelines:
- Green: Goal is achievable with the available schemes
- Yellow: Goal is partially achievable but needs adjustments
- Red: Goal is not achievable with current parameters and schemes

Provide practical, actionable advice in the reason field. Be specific about which schemes to use if applicable, or suggest alternative approaches if the goal isn't directly achievable.
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log('Raw Gemini Output:', text);

        // Try to extract JSON from the response
        let jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in Gemini response');
        }

        let jsonStr = jsonMatch[0];
        
        // Clean up the JSON string
        jsonStr = jsonStr.replace(/```json\s*/, '').replace(/```\s*$/, '');
        
        try {
            const recommendation = JSON.parse(jsonStr);
            
            // Validate the response structure
            if (!recommendation.color || !recommendation.reason) {
                throw new Error('Invalid recommendation structure');
            }

            // Ensure color is one of the expected values
            if (!['Green', 'Yellow', 'Red'].includes(recommendation.color)) {
                console.log('Invalid color, defaulting to Red:', recommendation.color);
                recommendation.color = 'Red';
            }

            return recommendation;
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            console.error('Attempted to parse:', jsonStr);
            
            // Fallback response
            return {
                color: 'Red',
                reason: 'Unable to analyze your goal due to a technical issue. Please try again or consult with a financial advisor for personalized recommendations.'
            };
        }

    } catch (error) {
        console.error('Goal GPS Error:', error);
        
        // Return a user-friendly error response
        return {
            color: 'Red',
            reason: `Analysis failed: ${error.message}. Please check your inputs and try again.`
        };
    }
}

module.exports = {
    getGoalRecommendation
};
