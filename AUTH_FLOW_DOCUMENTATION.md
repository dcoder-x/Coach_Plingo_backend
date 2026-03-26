# Authentication Flow Documentation

## Overview
Coach Plingo backend authentication is **stateless and token-based**, designed for mobile clients.

Supported login paths:
- **Email/Password** (`/auth/signup`, `/auth/login`)
- **OAuth** (`/auth/oauth` and Google callback)
- **OTP-based verification** for email and password reset

Authentication uses:
- **Access token (JWT Bearer)** for protected API calls
- **Refresh token (JWT Bearer)** for token renewal
- **Onboarding token (JWT Bearer)** for incomplete-profile users

---

## Architecture

### 1) API Layer
- `src/routes/auth.ts` defines all auth endpoints.
- Protected routes use `authenticateToken` middleware.
- Onboarding-only routes use `authenticateOnboardingToken` middleware.

### 2) Controller Layer
- `src/controllers/AuthController.ts` handles request/response orchestration.
- Delegates auth business logic to `UserService`.

### 3) Service Layer
- `src/services/UserService.ts` owns auth logic:
  - Password hashing and validation (`bcrypt`)
  - JWT creation and verification (`jsonwebtoken`)
  - OTP issuing and verification
  - OAuth account linking/creation

### 4) Middleware Layer
- `src/middleware/auth.ts` validates `Authorization: Bearer <token>`.
- Rejects missing/invalid/expired tokens.
- Enforces token type (`access`, `refresh`, `onboarding`).

### 5) Google OAuth Integration
- `src/config/passport.ts` configures Google strategy only.
- Passport is used to validate Google identity, then app-specific JWTs are issued by `UserService`.
- Google auth is configured with `session: false`.

---

## Token Model

### Access Token
- Purpose: authorize protected API calls
- Token type claim: `access`
- Default expiry: `JWT_EXPIRY` (default `7d`)

### Refresh Token
- Purpose: exchange for new access/refresh pair via `/auth/refresh`
- Token type claim: `refresh`
- Secret: `JWT_REFRESH_SECRET` (falls back to `JWT_SECRET`)
- Default expiry: `JWT_REFRESH_EXPIRY` (default `30d`)

### Onboarding Token
- Purpose: allow `/auth/onboarding` before profile completion
- Token type claim: `onboarding`
- Default expiry: `ONBOARDING_TOKEN_EXPIRY` (default `30m`)

---

## Auth Flows

### A) Email Signup + Verification + Onboarding
1. `POST /auth/signup`
2. User receives verification OTP via email
3. `POST /auth/verify-email-otp`
4. If profile incomplete, backend returns `onboardingToken`
5. `POST /auth/onboarding` with `Authorization: Bearer <onboardingToken>`
6. Backend returns full auth `token` object (access + refresh)

### B) Email Login
1. `POST /auth/login`
2. If email not verified → `nextStep: VERIFY_EMAIL`
3. If profile incomplete → `nextStep: COMPLETE_ONBOARDING` + `onboardingToken`
4. If complete → `nextStep: AUTHENTICATED` + `token`

### C) OAuth Login
1. Mobile client can use `POST /auth/oauth` with provider identity
2. Web OAuth callback path (`/auth/google/callback`) also resolves to app JWT response
3. If profile incomplete → `onboardingToken`
4. If complete → auth `token` object

### D) Token Refresh
1. `POST /auth/refresh` with `refreshToken`
2. Backend validates refresh token type/signature/expiry
3. Returns fresh access + refresh token pair

### E) Protected API Access
1. Client sends `Authorization: Bearer <accessToken>`
2. `authenticateToken` validates token and type
3. `req.learnerId` is attached
4. Endpoint executes or returns 401

---

## Endpoint Summary

- `POST /auth/signup`
- `POST /auth/register` (alias)
- `POST /auth/login`
- `POST /auth/oauth`
- `GET /auth/google`
- `GET /auth/google/callback`
- `POST /auth/refresh`
- `POST /auth/logout` (stateless)
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/verify-email`
- `POST /auth/verify-email-otp`
- `POST /auth/resend-otp`
- `POST /auth/onboarding` (onboarding token)
- `GET /auth/me` (access token)
- `PUT /auth/profile` (access token)
- `POST /auth/avatar` (access token)
- `POST /auth/change-password` (access token)
- `DELETE /auth/account` (access token)

---

## Mobile App Recommendations

### Token Storage
- Store tokens in **platform secure storage**:
  - iOS: Keychain
  - Android: EncryptedSharedPreferences / Keystore-backed storage
  - React Native: secure storage libraries backed by OS keychain/keystore
- Avoid plain AsyncStorage/local storage for long-lived refresh tokens.

### Request Pattern
- Attach access token to every protected request:
  - `Authorization: Bearer <accessToken>`
- On `401` due to expiry:
  - call `/auth/refresh`
  - rotate tokens in secure storage
  - retry original request once

### Logout
- Remove local tokens from secure storage
- Optionally call `/auth/logout` with refresh token for server-side verification/logging

---

## Error Handling
Common auth status codes:
- `400` invalid input / invalid OTP
- `401` unauthorized / invalid or expired token
- `403` forbidden (e.g., onboarding without verified email)
- `404` learner not found
- `409` conflict (email already exists)

---

## Required Environment Variables

```env
JWT_SECRET=your_access_secret
JWT_EXPIRY=7d
JWT_REFRESH_SECRET=your_refresh_secret
JWT_REFRESH_EXPIRY=30d
ONBOARDING_TOKEN_EXPIRY=30m

GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

OTP_SECRET=your_otp_secret
OTP_TTL_MINUTES=10
DATABASE_URL=your_database_url
```

---

## Security Notes
- Passwords are hashed using `bcrypt`.
- OTP values are HMAC-hashed before DB storage.
- JWT token type is enforced in middleware.
- Refresh tokens are validated before renewal.
- Use HTTPS in production to protect bearer tokens in transit.
- Keep token TTLs short enough for risk control and long enough for UX.
