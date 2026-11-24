# Staybnb

A responsive React frontend and MongoDB-backed microservices backend for an Airbnb-style booking application.

## Features

- Separate guest and host registration/login
- Responsive property search and listing pages
- Guest booking, trip cancellation, and booking receipts
- Room inventory per date range, multi-room reservations, early checkout, and post-checkout guest reviews
- Host listing creation, editing status, unlisting/relisting, and deletion
- Host-defined listing availability date/time windows, enforced during search and booking
- Host editing for listing details, prices, capacity, amenities, images, and availability dates
- Demo payment checkout by default
- Optional Razorpay test/live checkout with server-side signature verification

For Razorpay, add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to `.env`. Without both values, Staybnb uses a no-charge demo payment flow.

## Services and MongoDB databases

Each service owns a separate MongoDB database. Mongoose creates collections and indexes when the services start and save their first records.

| Service | API prefix | MongoDB database | Main records |
|---|---|---|---|
| Auth | `/api/auth` | `airbnb_auth` | Users (unique email, password hash, guest/host role) |
| Listings | `/api/listings` | `airbnb_listings` | Listings, address, GeoJSON location, nightly price, capacity |
| Bookings | `/api/bookings` | `airbnb_bookings` | Guest/host/listing IDs, dates, guest count, total, status |
| Payments | `/api/payments` | `airbnb_payments` | Booking, guest, amount, INR currency, provider and payment status |
| Messaging | `/api/messaging` | `airbnb_messaging` | Booking conversations and messages |
| Notifications | `/api/notifications` | `airbnb_notifications` | User notifications and read time |

Nginx is the public entry point on port 4000 and reverse-proxies `/api/{service}/...` to each service. Internal service ports are 4001–4006. JWTs are issued by Auth and checked by protected endpoints; Nginx forwards the Authorization header. Nginx handles HTTP routing/reverse-proxy duties here; application authentication, validation, and business rules remain in the services.

## Run locally with Docker

The React frontend is built by Docker and served through Nginx alongside the API.

1. Copy `.env.example` to `.env` and replace `JWT_SECRET` with a long random value.
2. `MONGO_PORT` defaults to `27018` so Docker does not collide with a local MongoDB already listening on `27017`. Change it in `.env` if needed. From the project root run:

   ```powershell
   docker compose up --build
   ```

3. Check Nginx and services:

   ```powershell
   Invoke-RestMethod http://localhost:4000/health
   Invoke-RestMethod http://localhost:4000/api/auth/health
   Invoke-RestMethod http://localhost:4000/api/listings/health
   ```

   MongoDB is available to database tools at `mongodb://localhost:27018`; containers connect internally to `mongo:27017`.

4. Register a user and save the returned token:

   ```powershell
   $user = Invoke-RestMethod -Method Post http://localhost:4000/api/auth/register `
     -ContentType 'application/json' `
     -Body '{"name":"Taylor","email":"taylor@example.com","password":"change-this-password","role":"host"}'
   $token = $user.token
   $headers = @{ Authorization = "Bearer $token" }
   ```

5. Create a listing, then create a guest account to book it:

   ```powershell
   $listing = Invoke-RestMethod -Method Post http://localhost:4000/api/listings `
     -Headers $headers -ContentType 'application/json' `
     -Body '{"title":"Garden flat","description":"A bright place to stay","address":{"street":"1 Main Road","city":"Pune","country":"India"},"pricePerNight":3500,"maxGuests":2,"amenities":["wifi"]}'

   Invoke-RestMethod "http://localhost:4000/api/listings?city=Pune"
   ```

To book, register/login a guest and send `POST /api/bookings` with `listingId`, ISO `checkIn`/`checkOut` dates and `guestCount`. Create a payment record with `POST /api/payments` and that booking ID. This records a pending payment only; a real Razorpay order, webhook signature verification, and payment settlement still need merchant credentials and integration. Booking overlap checks are application-level and are not a substitute for a transactional/locking strategy under concurrent high-volume booking traffic.

Protected API calls use `Authorization: Bearer <token>`. Core routes:

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/listings?city=...&guests=...&minPrice=...&maxPrice=...`, `GET/POST /api/listings`, `PATCH/DELETE /api/listings/:id`
- `POST/GET /api/bookings`, `GET /api/bookings/:id`, `PATCH /api/bookings/:id/status`
- `POST/GET /api/payments`, `GET /api/payments/:id`
- `POST/GET /api/messaging`, `POST /api/messaging/:id/messages`
- `GET/POST /api/notifications`, `PATCH /api/notifications/:id/read`

Stop with `docker compose down`. MongoDB data remains in the `mongo_data` volume; `docker compose down -v` removes that data.
