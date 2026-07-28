# GO BHARAT 2.0

## Overview
Go Bharat 2.0 is a multi-role hyperlocal super app for the Indian market, aiming to create a comprehensive digital ecosystem. It supports six user roles (Customer, Vendor, Delivery, Franchise, Marketing, Super Admin) and integrates social commerce, streamlined vendor onboarding, and AI-enhanced search. The project's vision is to empower local businesses and service providers while offering a seamless consumer experience across e-commerce, hyperlocal services, and community interaction.

## User Preferences
I prefer detailed explanations.
I want an iterative development process.
I expect clear communication on progress and any blockers.
Do not make changes to folder `node_modules`.
Do not make changes to file `package-lock.json`.

## System Architecture
The application uses an Expo (React Native) frontend and an Express.js backend, both developed with TypeScript.

**Frontend:**
-   **Frameworks:** Expo Router, React Native, TypeScript.
-   **State Management:** React Context with AsyncStorage.
-   **UI/UX:** Primary saffron and dark blue theme, Poppins font. Features hierarchical navigation, comprehensive core screens (authentication, role-specific dashboards, product/category/store details, reels, wallet, etc.), carousel onboarding, and integrated payment checkout.
-   **Core Features:** Multi-Role System, Reels (social commerce with product tagging), Vendor Onboarding, Payment Gateway, COD Vendor Control, AI Search Assistant, Custom Sub-Categories, Team Management, Multi-Language Support, Advertisement Booking, Customer Stories, Community/Social Networking, In-app Admin Manual, Push Notification System, Personalized Promotion Engine, Daily Deal Slot Booking, Map-Based Delivery Tracking, Live Shopping, Go Bharat Coin loyalty/currency, Withdrawal System, Legal Agreements, GST-compliant Invoice System, Category-Specific Vendor Panels, Full-Screen Vendor Map with Category Filters.
-   **Technical Implementations:** Guest purchase blocking, account deletion, PCI-compliant payment security (Razorpay), JWT Authentication, persistent payment storage with webhook handling, security hardening (Helmet, rate limiting, CORS), role-based authorization, database indexing, server-side caching, database connection pooling, batch database operations, persistent data stores (PostgreSQL for feature flags, dynamic pages, announcements, etc.), automatic 401 handling, SMS OTP via Fast2SMS, Email OTP via Resend, vendor and custom subcategory persistence in PostgreSQL, dynamic route "Not Found" screens, OpenStreetMap-based explore map, vendor profile photo management, and current location integration for delivery addresses.

**Backend:**
-   **Technology:** Express.js with TypeScript, running on port 5000.
-   **Web Interfaces:** Serves the Expo app and an admin panel.
-   **API:** Provides all necessary endpoints, including AI search and payment processing.
-   **Deployment:** Utilizes Autoscale deployment with a CJS bootstrap for rapid health check responses and dynamic import of the full Express app.

## External Dependencies
-   **Expo:** React Native development and build processes.
-   **React Native:** Mobile application development framework.
-   **Express.js:** Backend web framework.
-   **TypeScript:** Type-safe development.
-   **AsyncStorage:** Client-side data persistence.
-   **OpenAI:** AI Search Assistant (gpt-4o-mini model via Replit AI integration).
-   **Pexels:** Sample video URLs for reels.
-   **Razorpay:** Payment Gateway (UPI, Net Banking).
-   **Fast2SMS:** Indian SMS gateway for OTP delivery.
-   **Resend:** Email service for OTP verification codes.
-   **EAS Build:** Expo Application Services for building APK/AAB files.

## Database Migration Status (Completed)

All static frontend data has been migrated to PostgreSQL:

| Table | Records | Description |
|---|---|---|
| categories | 5 | B2B, B2C, Service, Manpower, Travel |
| sub_categories | 108 | All sub-categories by category |
| vendors | 7 | 5 travel vendors + 2 live DB vendors |
| products | 26 | 23 travel products + 3 others |
| bus_routes | 8 | Malegaon-origin bus routes |
| coupons | 5 | Promo codes |

**New API Endpoints:**
- `GET /api/categories` — returns all categories from DB
- `GET /api/subcategories` — returns all sub-categories from DB
- `GET /api/bus-routes?vendorId=X&productId=Y` — returns bus routes from DB

**AppProvider Live Data (DB-driven):**
- `liveCategories` — fetched from `/api/categories`, used in home/explore/category screens
- `liveSubCategories` — fetched from `/api/subcategories`, used in category/subcategory/store screens
- `liveBusRoutes` — fetched from `/api/bus-routes`, available via `useApp()`

Static arrays in `lib/data.ts` serve as offline fallback only. Components prefer live context data when available.

## Travel Booking Sub-Category UIs
Travel vendors are detected by their `subCategoryId` (or by matching FLIGHT_VENDOR_IDS/TRAIN_VENDOR_IDS). The store product card renders sub-category-specific booking CTAs:

| Sub-Category | ID | Button Label | Screen |
|---|---|---|---|
| Bus Booking | sc101 | BOOK (blue) | `/bus-booking` |
| Flight Booking | sc107 | SELECT CLASS (indigo) | `/flight-booking` |
| Cab & Taxi | sc102 | BOOK RIDE (orange) | `/cab-booking` |
| Tempo & Traveller | sc105 | BOOK VEHICLE (green) | `/cab-booking?subCategory=sc105` |
| Train Ticket | sc108 | BOOK BERTH (red) | `/bus-booking` |

### `/app/flight-booking.tsx`
Full airplane seat map with 3 class tiers: First (rows 1-2, 3.5× price), Business (rows 3-6, 2× price), Economy (rows 7-28, base price). 3-3 seat layout (A-B-C | aisle | D-E-F). Seats randomly pre-booked per product ID seed. Passenger form modal → addToCart → cart.

### `/app/cab-booking.tsx`
Vehicle icon display, pickup/destination inputs, passenger count (1-7), AC/Non-AC comfort toggle (+15% AC surcharge), trip note, fare breakdown. Works for both Cab & Taxi and Tempo & Traveller. Product data passed via route params (productName, productPrice, etc.).

## Franchise Territory — Pin Code Routing

Vendor applications are routed to franchise owners by matching the **vendor's pin code** against the **franchise owner's registered pin code** in `team_members.pin_code` (role = FRANCHISE).

**How it works:**
1. **New application submission** — Server looks up active FRANCHISE members whose `pin_code` equals the vendor's `pinCode`. Uses the matching owner's phone as `franchiseId`. If no match, `franchiseId` is left empty (unassigned).
2. **Application pin code edit** — `PATCH /api/vendor-applications/:id/fields` accepts `pinCode`, re-derives `franchiseId` the same way, and syncs `pinCode` + `franchiseId` to the vendor row if the application is LIVE.
3. **Startup migration** — On server start, all applications with a non-empty `pinCode` are re-evaluated: if a matching franchise owner exists, `franchiseId` is updated; if not, `franchiseId` is cleared (so Mumbai-pin apps no longer appear in Malegaon franchise dashboard).
4. **Client-side filtering** (`isMyApp` in franchise dashboard) — Primary: if the application has a pin code, show it only if it matches the franchise owner's pin code. Fallback: legacy `franchiseId` / `submittedBy` matching for apps without a pin code.
5. **Franchise vendor edit form** now includes a **Pin Code** field — changing it triggers server-side re-routing to the new territory's franchise owner.

**Franchise owner's pin code** is read from `teamMembers` context (mapped from `team_members.pin_code` where `role = FRANCHISE`).