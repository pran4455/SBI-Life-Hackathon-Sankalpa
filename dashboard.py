import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import seaborn as sns
import matplotlib.pyplot as plt
import altair as alt
import time
import plotly.graph_objects as go
import plotly.express as px
from datetime import datetime, timedelta
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

# Page Configuration
st.set_page_config(page_title="InsureInsights", layout="wide")

# Title and Description
st.title("InsureInsights: Real-Time Analytics Dashboard")

# Sample Data for Visualization
def generate_sample_data():
    dates = pd.date_range(start=datetime.today() - timedelta(days=365), end=datetime.today(), freq="D")
    policy_demand = np.random.randint(100, 500, size=len(dates))
    claims_amount = np.random.randint(1000, 10000, size=len(dates))
    fraud_flags = np.random.choice([0, 1], size=len(dates), p=[0.95, 0.05])
    engagement = np.random.randint(50, 200, size=len(dates))
    return pd.DataFrame({
        "Date": dates,
        "Policy Demand": policy_demand,
        "Claims Amount": claims_amount,
        "Fraud Flag": fraud_flags,
        "Engagement": engagement
    })

data = generate_sample_data()

# Main Sections

# Function to load CSS
def load_css():
    try:
        with open(r"public\static\styles.css", "r") as f:
            css_content = f.read()
            st.markdown(f"<style>{css_content}</style>", unsafe_allow_html=True)
    except Exception as e:
        st.write(f"❌ Error loading CSS: {e}")

# Call this function **ONLY ONCE** at the beginning of your script
load_css()

st.sidebar.title("InsureInsights")
options = st.sidebar.radio("Choose a module:", ["Predictive Insights", "Campaign AI Optimization", "Fraud Detection", "Real-Time Engagement Metrics", "Inspirational Success Stories"])

# 1. Predictive Insights 📊
if options == "Predictive Insights":
    st.header("📊 Predictive Insights")
    st.markdown("""
    **Use AI models** (RandomForest) to predict *customer behavior*, such as:
    - 🔴 Who is likely to **miss a payment**?
    - 🟡 Who might **churn**?
    - 🟢 Who is likely to **purchase an add-on policy**?
    """)

    # Upload Dataset
    uploaded_file = st.file_uploader("Upload your dataset (CSV)", type=["csv"])

    if uploaded_file is not None:
        data = pd.read_csv(uploaded_file)
        st.success("✅ File Uploaded Successfully!")

        # Display Data Preview
        st.subheader("📌 Dataset Preview")
        st.dataframe(data.head())

        # Ensure necessary columns exist
        required_columns = [
            "CreditScore", "Geography", "Gender", "Age", "Tenure", "Balance", 
            "NumOfProducts", "HasCrCard", "IsActiveMember", "EstimatedSalary", 
            "Exited", "UpsellRecommendation"
        ]
        
        if not all(col in data.columns for col in required_columns):
            st.error("❌ Dataset must contain the required columns!")
        else:
            # Convert categorical data
            data["Gender"] = data["Gender"].map({"Male": 0, "Female": 1})
            data = pd.get_dummies(data, columns=["Geography"], drop_first=True)

            # Ensure Geography columns exist (fill missing ones with 0)
            for col in ["Geography_Germany", "Geography_Spain"]:
                if col not in data.columns:
                    data[col] = 0  

            # Define features and targets
            features = ["CreditScore", "Age", "Tenure", "Balance", "NumOfProducts", 
                        "HasCrCard", "IsActiveMember", "EstimatedSalary", 
                        "Geography_Germany", "Geography_Spain"]
            
            targets = {
                "Missed Payment": "Balance",   # Assume high balance -> likely to miss payment
                "Churn": "Exited",
                "Upsell Recommendation": "UpsellRecommendation"
            }

            predictions = {}

            # Train Models for Each Prediction Task
            for key, target in targets.items():
                y = data[target] if key != "Missed Payment" else (data["Balance"] > data["Balance"].median()).astype(int)
                X_train, X_test, y_train, y_test = train_test_split(data[features], y, test_size=0.2, random_state=42)

                model = RandomForestClassifier(n_estimators=100, random_state=42)
                model.fit(X_train, y_train)
                y_pred = model.predict(X_test)

                accuracy = accuracy_score(y_test, y_pred)

                # Store predictions only for test set, ensuring alignment
                predictions[key] = (pd.Series(y_pred, index=X_test.index), accuracy)

            # Visualizing Predictions
            st.subheader("📈 Model Performance")
            prediction_data = {
                "Category": list(predictions.keys()),
                "Accuracy": [predictions[key][1] for key in predictions.keys()]
            }
            
            df_pred = pd.DataFrame(prediction_data)
            fig = px.bar(df_pred, x="Category", y="Accuracy", title="Model Accuracy for Predictions", text_auto=True)
            st.plotly_chart(fig)

            # Show separate predictions for each category
            st.subheader("🔍 Who is likely to Miss a Payment?")
            miss_payment_df = data.loc[X_test.index, ["CreditScore", "Age", "Balance", "NumOfProducts"]].copy()
            miss_payment_df["Missed Payment"] = predictions["Missed Payment"][0]
            st.dataframe(miss_payment_df.head(10))

            st.subheader("🔍 Who might Churn?")
            churn_df = data.loc[X_test.index, ["CreditScore", "Age", "Balance", "NumOfProducts"]].copy()
            churn_df["Churn"] = predictions["Churn"][0]
            st.dataframe(churn_df.head(10))

            st.subheader("🔍 Who is likely to Purchase an Add-on Policy?")
            upsell_df = data.loc[X_test.index, ["CreditScore", "Age", "Balance", "NumOfProducts"]].copy()
            upsell_df["Upsell Recommendation"] = predictions["Upsell Recommendation"][0]
            st.dataframe(upsell_df.head(10))

            st.markdown("**Legend:** 1️⃣ = Likely, 0️⃣ = Unlikely")
            
# 2. Campaign AI Optimization 🎯
elif options == "Campaign AI Optimization":
    st.header("🎯 Campaign AI Optimization")
    st.markdown("""
        **Marketing Performance**: Optimize campaigns with real-time engagement metrics and conversion rates.
    """)

    # Funnel Chart for Conversion Rates
    st.subheader("Conversion Funnel")
    funnel_data = pd.DataFrame({
        "Stage": ["Impressions", "Clicks", "Signups", "Purchases"],
        "Count": [135000, 45000, 20000, 9000]
    })
    fig = px.funnel(funnel_data, x="Count", y="Stage")
    st.plotly_chart(fig)

    # Real-Time Engagement Map (Indian Cities)
    st.subheader("Geographic Campaign Impact (India)")

    # Data for Indian cities
    indian_cities = pd.DataFrame({
        "City": ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Lucknow"],
        "Engagement": [20000, 15000, 30000, 10000, 25000, 10000, 20000, 11000, 5000, 9000],
        "Latitude": [19.0760, 28.7041, 12.9716, 17.3850, 13.0827, 22.5726, 18.5204, 23.0225, 26.9124, 26.8467],
        "Longitude": [72.8777, 77.1025, 77.5946, 78.4867, 80.2707, 88.3639, 73.8567, 72.5714, 75.7873, 80.9462]
    })

    # Creating an interactive scatter geo map
    fig = px.scatter_geo(
        indian_cities, 
        lat="Latitude", 
        lon="Longitude", 
        size="Engagement", 
        hover_name="City",
        size_max=30,  # Adjust max size of the bubbles
        color="Engagement",
        color_continuous_scale="sunsetdark",  # Enhancing the color scale
        scope="asia",  # 'india' is not supported in Plotly
        fitbounds="locations",  # Ensures India is centered
        title="Campaign Engagement Across Indian Cities"
    )

    # Update layout for better visibility
    fig.update_geos(
        visible=True, 
        showcountries=True, 
        countrycolor="Black"
    )

    # Display map in Streamlit
    st.plotly_chart(fig)

    # Display Top 5 Cities with Highest Engagement
    st.subheader("🏆 Top 5 Cities with Highest Campaign Engagement")
    top_5_cities = indian_cities.nlargest(5, "Engagement")  # Get top 5 cities by engagement

    # Display as a table
    st.table(top_5_cities[["City", "Engagement"]])

# 3. Fraud Detection 🔍
elif options == "Fraud Detection":
    st.header("🔍 Fraud Detection")
    st.markdown("### AI-Powered Fraud Insights for Banking & Insurance")

    # Generate Sample Fraud Data
    def generate_fraud_data():
        dates = pd.date_range(start=datetime.today() - timedelta(days=365), end=datetime.today(), freq="D")
        cities = ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Lucknow"]
        states = ["Maharashtra", "Delhi", "Karnataka", "Telangana", "Tamil Nadu", "West Bengal", "Maharashtra", "Gujarat", "Rajasthan", "Uttar Pradesh"]
        policy_types = ["Life Insurance", "Health Insurance", "Car Insurance", "Credit Card", "Bank Loan"]
        transaction_types = ["Online Transfer", "ATM Withdrawal", "UPI", "Credit Card Swipe", "Cheque Fraud"]
        fraud_counts = np.random.randint(5000, 50000, size=len(dates))
        months = dates.strftime("%b")
        years = np.random.choice(range(2012, 2025), size=len(dates))  # Random years between 2012 and 2024

        return pd.DataFrame({
            "Date": dates,
            "City": np.random.choice(cities, size=len(dates)),
            "State": np.random.choice(states, size=len(dates)),
            "Policy Type": np.random.choice(policy_types, size=len(dates)),
            "Transaction Type": np.random.choice(transaction_types, size=len(dates)),
            "Fraud Count": fraud_counts,
            "Month": months,
            "Year": years
        })

    fraud_data = generate_fraud_data()

    # **1️⃣ Fraud Hotspots by Location**
    st.subheader("🌍 Fraud Hotspots Across Cities")

    # Data for Indian cities (latitude and longitude)
    indian_cities = pd.DataFrame({
        "City": ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Lucknow"],
        "Latitude": [19.0760, 28.7041, 12.9716, 17.3850, 13.0827, 22.5726, 18.5204, 23.0225, 26.9124, 26.8467],
        "Longitude": [72.8777, 77.1025, 77.5946, 78.4867, 80.2707, 88.3639, 73.8567, 72.5714, 75.7873, 80.9462]
    })

    # Merge fraud data with city coordinates
    fraud_data_with_coords = fraud_data.merge(indian_cities, on="City", how="left")

    # Creating an interactive scatter geo map
    fig = px.scatter_geo(
        fraud_data_with_coords,
        lat="Latitude",
        lon="Longitude",
        size="Fraud Count",  # Size of bubbles based on fraud count
        hover_name="City",  # Display city name on hover
        size_max=30,  # Adjust max size of the bubbles
        color="Fraud Count",  # Color of bubbles based on fraud count
        color_continuous_scale="Reds",  # Color scale for fraud count
        scope="asia",  # Focus on Asia (India is not directly supported in Plotly)
        fitbounds="locations",  # Ensures India is centered
        title="Fraud Hotspots Across Indian Cities"
    )

    # Update layout for better visibility
    fig.update_geos(
        visible=True,
        showcountries=True,
        countrycolor="Black"
    )
    # Display map in Streamlit
    st.plotly_chart(fig)

    # **2️⃣ Fraud Trends Over Time**
    st.subheader("📊 Fraud Cases Over the Year")

    # Dropdown to select year
    selected_year = st.selectbox("Select Year", range(2012, 2025))

    # Filter data for selected year
    fraud_data_filtered = fraud_data[fraud_data["Year"] == selected_year]

    # Group by month and sum fraud counts
    fraud_trends = fraud_data_filtered.groupby("Month")["Fraud Count"].sum().reset_index()

    # Plot line chart
    fig2 = px.line(fraud_trends, x="Month", y="Fraud Count", markers=True, title=f"Fraud Trends by Month for {selected_year}", line_shape="spline")
    st.plotly_chart(fig2)

    # **3️⃣ Fraud by Policy Type**
    st.subheader("📌 Which Policy Types Have More Fraud?")
    fig3 = px.bar(fraud_data, x="Policy Type", y="Fraud Count", color="Policy Type", title="Fraud Cases by Policy Type")
    st.plotly_chart(fig3)

    # **4️⃣ Fraud by Transaction Type**
    st.subheader("💳 Risky Transaction Methods")
    fig4 = px.pie(fraud_data, names="Transaction Type", values="Fraud Count", title="Fraud by Transaction Type")
    st.plotly_chart(fig4)

    # Dynamic Key Takeaways
    st.markdown("#### 📢 Key Takeaways for Bank Staff & Customers:")

    # Get top cities with highest fraud counts
    top_cities = fraud_data.groupby("City")["Fraud Count"].sum().nlargest(2).index.tolist()
    top_cities_str = ", ".join(top_cities)

    # Get top months with highest fraud counts
    top_months = fraud_data_filtered.groupby("Month")["Fraud Count"].sum().nlargest(2).index.tolist()
    top_months_str = ", ".join(top_months)

    # Get top transaction types with highest fraud counts
    top_transactions = fraud_data.groupby("Transaction Type")["Fraud Count"].sum().nlargest(2).index.tolist()
    top_transactions_str = ", ".join(top_transactions)

    # Get top policy types with highest fraud counts
    top_policies = fraud_data.groupby("Policy Type")["Fraud Count"].sum().nlargest(2).index.tolist()
    top_policies_str = ", ".join(top_policies)

    st.markdown(f"""
    - **Monitor High-Risk Locations**: Cities like **{top_cities_str}** show higher fraud rates.
    - **Seasonal Trends**: Fraud spikes during certain months like **{top_months_str}**.
    - **Risky Transactions**: **{top_transactions_str}** are top fraud-prone transaction types.
    - **High-Risk Policy Types**: **{top_policies_str}** have higher fraud rates.
    """)

# 4. Real-Time Engagement Metrics ⏱️
elif options == "Real-Time Engagement Metrics":
    st.header("⏱️ Real-Time Engagement Metrics")
    st.markdown("""
        **Live Updates**: Monitor key metrics like conversion rates, active policies, and fraud alerts.
    """)

    # Function to generate dynamic KPI values
    def generate_kpi_values():
        return {
            "Active Policies": np.random.randint(1000, 1500),
            "Fraud Alerts": np.random.randint(5, 20),
            "Conversion Rate": np.random.randint(10, 20),
            "Engagement Score": np.random.randint(70, 100),
            "Customer Retention Rate": np.random.randint(60, 90),
            "Policy Claim Success Rate": np.random.randint(50, 85)
        }

    # Time range filter
    time_range = st.selectbox("📅 Select Time Range", ["Today", "Last Week", "Last Month"])

    # Create a placeholder for the metrics
    kpi_placeholder = st.empty()

    # Run live update in a loop
    while True:
        kpi_values = generate_kpi_values()

        # Update the metrics within the placeholder
        with kpi_placeholder.container():
            col1, col2, col3 = st.columns(3)
            col4, col5, col6 = st.columns(3)

            with col1:
                st.metric("📋 Active Policies", kpi_values["Active Policies"], delta=np.random.randint(-50, 50))
                st.caption("""
                    **Active Policies**: The total number of insurance policies currently active. 
                    This metric helps track the growth and retention of your customer base. 

                    🔹 **Why It Matters?** A steady increase indicates business growth, while a drop may signal customer churn.  
                    🔹 **Tip:** Monitor trends and customer feedback to improve retention rates.
                """)

            with col2:
                st.metric("⚠️ Fraud Alerts", kpi_values["Fraud Alerts"], delta=np.random.randint(-5, 5))
                st.caption("""
                    **Fraud Alerts**: The number of potential fraud cases detected in real-time. 
                    Monitoring this metric helps in mitigating risks and ensuring policyholder trust. 

                    🔹 **Why It Matters?** A high number may indicate vulnerabilities in your security systems.  
                    🔹 **Tip:** Use AI-based fraud detection tools to reduce false positives and enhance security.
                """)

            with col3:
                st.metric("📈 Conversion Rate", f"{kpi_values['Conversion Rate']}%", delta=np.random.randint(-2, 3))
                st.caption("""
                    **Conversion Rate**: The percentage of leads converted into active policies. 
                    A higher rate indicates effective sales and marketing strategies.  

                    🔹 **Why It Matters?** A low conversion rate might suggest issues with pricing, competition, or customer trust.  
                    🔹 **Tip:** Optimize customer onboarding, personalize offerings, and leverage digital marketing.
                """)

            with col4:
                st.metric("⭐ Engagement Score", f"{kpi_values['Engagement Score']}/100", delta=np.random.randint(-5, 6))
                st.caption("""
                    **Engagement Score**: A measure of customer interaction with your services. 
                    Higher scores indicate better customer satisfaction and loyalty.  

                    🔹 **Why It Matters?** Engaged customers are more likely to renew policies and recommend your service.  
                    🔹 **Tip:** Improve customer experience through personalized services and proactive communication.
                """)

            with col5:
                st.metric("🔄 Customer Retention Rate", f"{kpi_values['Customer Retention Rate']}%", delta=np.random.randint(-5, 5))
                st.caption("""
                    **Customer Retention Rate**: The percentage of customers retained over a period. 
                    A high retention rate reflects strong customer relationships and service quality.  

                    🔹 **Why It Matters?** Retaining customers is more cost-effective than acquiring new ones.  
                    🔹 **Tip:** Offer loyalty programs, improve claim processes, and enhance support services.
                """)

            with col6:
                st.metric("✅ Policy Claim Success Rate", f"{kpi_values['Policy Claim Success Rate']}%", delta=np.random.randint(-5, 5))
                st.caption("""
                    **Policy Claim Success Rate**: The percentage of claims successfully processed. 
                    A higher rate indicates efficient claim handling and customer satisfaction.  

                    🔹 **Why It Matters?** A low success rate may indicate inefficiencies or strict claim rejection policies.  
                    🔹 **Tip:** Streamline claim processing, improve documentation, and enhance fraud detection.
                """)

        # Wait for 2 seconds before updating again
        time.sleep(2)

        # Force Streamlit to refresh the UI
        st.rerun()

# 5. Inspirational Success Stories 📖
elif options == "Inspirational Success Stories":
    st.header("📚 Inspirational Success Stories")

    # Stories Dictionary
    stories = {
        "Empowering Small Businesses with MSME Loans": 
            "Ramesh, a small business owner from Tamil Nadu, struggled to expand his textile shop due to a lack of funds. "
            "SBI’s MSME loan under the Mudra scheme helped him secure ₹10 lakhs at a low interest rate. With this financial boost, "
            "he upgraded his machinery and increased production, doubling his revenue within a year. Today, his shop employs 15 workers "
            "and supplies textiles across India. He has also started an online store, increasing his customer base beyond his city. "
            "With increased profits, he reinvested in new fabric varieties, making his shop a one-stop solution for local traders. "
            "His business success has inspired many in his community to apply for MSME loans. Ramesh also conducts training sessions "
            "for budding entrepreneurs on financial literacy. His journey showcases how small businesses can thrive with the right financial support.",
        
        "Farmer’s Growth with SBI Kisan Credit Card": 
            "Meera, a farmer in Punjab, faced challenges due to unpredictable weather and rising input costs. "
            "With SBI’s Kisan Credit Card, she received timely financial assistance for purchasing seeds, fertilizers, and irrigation equipment. "
            "This helped her improve crop yield significantly, increasing her profits. Now, she not only sustains her farm but also educates her "
            "children in a reputed agricultural university. With better financial security, she has diversified into organic farming, "
            "tapping into a premium market. Meera also introduced drip irrigation on her farm, reducing water usage while maintaining high yields. "
            "She has started exporting organic produce, further boosting her income. Inspired by her success, neighboring farmers have applied "
            "for similar credit facilities. Meera now participates in agricultural seminars, sharing her knowledge and promoting sustainable farming practices.",
        
        "Dream Home Made Possible with SBI Home Loan": 
            "Arun and Priya, a young couple from Bangalore, always dreamed of owning a house but found it difficult to manage finances. "
            "SBI’s Home Loan with affordable EMIs and a low-interest rate helped them buy their dream apartment. With expert guidance and quick loan approval, "
            "they moved into their new home within months. Today, they enjoy a secure and happy life with their two children. "
            "With the burden of rent lifted, they have been able to save more for their children’s future. The loan also enabled them to furnish their home, "
            "creating a comfortable space for their family. Arun has now started a side business, using the financial security to pursue his passion. "
            "Priya has taken an SBI personal loan to start a small home bakery, adding to their income. Their success story is a testament to the power of well-structured financial planning.",
        
        "Digital Banking Empowering Senior Citizens": 
            "Seema, a retired teacher from Mumbai, initially found online banking challenging. SBI’s YONO app transformed her banking experience by making "
            "transactions, bill payments, and pension tracking effortless. With guidance from the SBI team, she became confident in using digital banking. "
            "Today, she manages her finances independently and even teaches others how to use online banking safely. She has helped several other senior citizens "
            "open digital banking accounts. Seema also started an online investment portfolio with SBI, ensuring financial growth in her retirement years. "
            "She frequently conducts workshops on financial literacy for seniors in her community. With the convenience of digital payments, she no longer "
            "relies on cash transactions. Her story proves that technology, when made accessible, can empower every age group.",
        
        "Education Loan Changing Lives": 
            "Ajay, a bright student from a small village in Uttar Pradesh, struggled to fund his engineering education. SBI’s Education Loan enabled him "
            "to study at a prestigious IIT without financial worries. With a successful career in an MNC today, he has repaid his loan and supports his family. "
            "His journey from financial struggles to professional success is an inspiration to many aspiring students. Ajay has now started mentoring students "
            "in rural areas, guiding them on scholarship and loan opportunities. He frequently donates to educational funds, ensuring others get the same opportunities "
            "he received. With his financial stability, he has built a library in his village to help students access quality study materials. "
            "His success has motivated many in his village to pursue higher education. Ajay believes that financial assistance combined with hard work can change lives.",
        
        "SBI Personal Loan for Medical Emergencies": 
            "Rajesh, a middle-class father from Hyderabad, faced a medical emergency when his son needed urgent heart surgery. "
            "With SBI’s quick personal loan approval, he secured ₹5 lakhs within 24 hours. The funds ensured that his son received immediate medical care, "
            "saving his life. The flexible EMI options allowed Rajesh to manage repayments without financial stress. Grateful for SBI’s support, "
            "he now advocates for financial planning among friends. The incident inspired him to start a small insurance consultancy to help others prepare for emergencies. "
            "His son, now fully recovered, excels in academics and dreams of becoming a doctor. Rajesh believes financial security during a crisis can change lives. "
            "SBI’s swift response and customer-first approach gave him hope when he needed it the most.",
        
        "Women Entrepreneurs Thriving with SBI Business Loans": 
            "Pooja, a passionate entrepreneur from Jaipur, always dreamed of starting a handcrafted jewelry business. "
            "However, limited capital and high initial costs discouraged her from taking the leap. SBI’s Business Loan for Women Entrepreneurs "
            "helped her secure ₹8 lakhs at an affordable rate. She set up a small workshop and expanded her business online. "
            "Within two years, her brand gained popularity on social media and started exporting globally. She now employs 20 artisans, "
            "preserving traditional Indian craftsmanship. The financial support also helped her attend international exhibitions, boosting her brand’s reputation. "
            "Today, her business earns over ₹50 lakhs annually. She credits SBI for making her dream a reality and actively mentors other aspiring women entrepreneurs.",
        
        "Empowering Youth with SBI Start-Up Loan": 
            "Varun, a tech enthusiast from Bangalore, had an innovative AI-based app idea but lacked the capital to launch. "
            "SBI’s Start-Up Loan under the Stand-Up India scheme provided him with ₹15 lakhs to build his product. With financial backing, "
            "he hired a team of developers and launched his app within a year. The app, which simplifies financial planning for young professionals, "
            "quickly gained traction. Within two years, Varun secured venture funding, scaling his business to a national level. "
            "His start-up now employs over 50 professionals and collaborates with top financial institutions. SBI’s support in the early stages "
            "was crucial in bringing his idea to life. Today, Varun actively invests in other budding entrepreneurs, paying forward the support he once received. "
            "His journey is an inspiration to every young innovator seeking financial backing."
    }

    # User selects a story from dropdown
    selected_story = st.selectbox("Choose a Success Story:", list(stories.keys()))

    # Display the selected story with better formatting
    st.markdown(f"### **{selected_story}**")  # Title in bold and larger text
    st.markdown(stories[selected_story])  # Story content

# Run the App
if __name__ == "__main__":
    st.write("")
