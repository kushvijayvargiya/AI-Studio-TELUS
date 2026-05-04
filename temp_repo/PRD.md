# Product Requirements Document (PRD): AXON Intelligence Suite

## 1. Executive Summary
**Project Name:** AXON Intelligence Suite  
**Vision:** To revolutionize contract management for enterprise service providers by transforming static documents into dynamic, actionable intelligence. AXON automates the ingestion, analysis, and visualization of complex Statements of Work (SOW) and Change Orders (CO), enabling proactive revenue management and strategic decision-making.

---

## 2. Target Audience
*   **Customer Success Managers (CSMs):** To track service adoption, health, and renewal risks.
*   **Finance & Billing Operations:** To reconcile actual quantities against contracted amounts and detect margin leakage.
*   **Portfolio Managers:** To gain a high-level view of revenue distribution and partner performance.
*   **Executive Leadership:** To monitor portfolio growth, cost rationalization, and strategic KPIs.

---

## 3. Key Features

### 3.1. AI-Powered Ingestion & Analysis
*   **Multi-Source Parsing:** Support for PDF, Word, and Text documents via ZIP uploads.
*   **Semantic Extraction:** Automated extraction of service names, types (MS vs. PS), amounts, signatures, and effective dates using Gemini AI.
*   **Relational Mapping:** AI-driven association of Change Orders (CO) to their parent Statements of Work (SOW).

### 3.2. Smart Intelligence & Natural Language Query
*   **Dynamic Dashboard (Smart Insights):** A "Chat-to-Chart" interface where users can ask questions like "Show me revenue by customer" or "What is our MS vs PS split?" and receive instant visualizations.
*   **Global Portfolio Analytics:** Aggregated views of all customers, service distribution, and growth trends.
*   **Pinning Favorites:** Ability to persist AI-generated charts for quick access.

### 3.3. Financial & Performance Monitoring
*   **Billing Reconciliation:** Monthly reporting logic to calculate recurring (MS) and one-time (PS/TS) revenue.
*   **Budget vs. Actuals:** Comparison of contract quantities against monthly actual inputs (CSV/Manual).
*   **Margin Analysis:** Built-in tools for assessing profitability and cost leakage across contracts.
*   **Revenue Waterfall:** Visual representation of how revenue evolves from the base SOW through successive COs.

### 3.4. Lifecycle & Risk Management
*   **Contract Timeline:** A unified view of all SOW/CO start and end dates to visualize the contract lifecycle.
*   **Risk Dashboard:** Automated detection of unsigned documents, expiring contracts, and notice period compliance.
*   **Renewal Health Score:** A strategic assessment based on contract proximity, product intensity, and billing health.

---

## 4. User Personas & Flows

### Persona 1: The Billing Analyst
*   **Goal:** Reconcile this month's billing for Felix Schoeller.
*   **Flow:** 
    1. Navigate to the **Billing** tab.
    2. Filter by Customer: Felix Schoeller.
    3. Review active MS quantities vs. actual units from the partner.
    4. Export reconciliation report for the finance system.

### Persona 2: The Portfolio Lead
*   **Goal:** Understand the impact of recent service cancellations.
*   **Flow:**
    1. Open **Smart Insights**.
    2. Query: "Show revenue impact of cancellations in the last 6 months."
    3. AI generates a Bar/Pie chart showing zeroed-out SOWs and remaining active revenue.
    4. Pin the chart for the next executive review.

---

## 5. Technical Architecture
*   **Frontend:** React 18+ with Vite for rapid development and high performance.
*   **Styling:** Tailwind CSS for a modern, responsive, and branded (TELUS/AXON) UI.
*   **AI Engine:** Google Gemini (models/gemini-3.1-pro-preview and gemini-3-flash-preview) for advanced reasoning and JSON-structured data extraction.
*   **Persistence:** IndexedDB (via `idb` library) for local, secure storage of sensitive contract data, results, and user preferences.
*   **Charts/Dataviz:** Recharts for high-fidelity, interactive visualizations.
*   **Icons:** Lucide-React for consistent enterprise-grade iconography.

---

## 6. Security & Privacy
*   **Privacy Mode:** A UI-level toggle to mask sensitive customer names and financial figures during presentations.
*   **Client-Side Processing:** Most analysis and storage occur on the client side (IndexedDB), minimizing data transmission risks.
*   **Role-Based Access (RBAC):** Simulated roles (Admin, Editor, Viewer) to control editing capabilities and access to sensitive management tools.

---

## 7. Roadmap & Future Enhancements
*   **Google Drive Integration:** Direct automated ingestion from managed folders.
*   **Predictive Analytics:** Forecasting revenue leakage based on historical quantity trends.
*   **SSO Integration:** Enterprise-grade authentication (Okta/Azure AD).
*   **Enhanced Comparison Engines:** Side-by-side textual diffs of SOW versions.

---
*Created by AXON Intelligence Team*
