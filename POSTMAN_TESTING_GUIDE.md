# Coach Plingo Auth API - Postman Testing Guide

## Quick Start

1. **Import the Postman Collection**
   - Open Postman
   - Click `File → Import`
   - Select `Coach_Plingo_Auth_API.postman_collection.json`
   - Collection will be imported with all endpoints pre-configured

2. **Set Up Environment Variables**
   - In the collection, set the variables in the bottom tabs:
     - `base_url`: `http://localhost:3000/api` (adjust if using different port)
     - `access_token`: Leave empty, will populate after login
     - `refresh_token`: Leave empty, will populate after login
     - `learner_id`: Leave empty, will populate after login

3. **Start Your Backend**
   ```bash
   npm run dev
   ```

---

## Testing Flows

### **Flow 1: Email & Password Signup + Email Verification**

#### Step 1: Sign Up
- **Endpoint:** `POST /auth/signup`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "testuser@example.com",
    "password": "TestPass123!",
    "fullName": "Test User",
    "nativeLanguage": "en"
  }
  ```
- **Expected Response (201):**
  ```json
  {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "learner": {
      "id": "user-123",
      "email": "testuser@example.com",
      "fullName": "Test User",
      "emailVerified": false,
      "avatarUrl": null
    }
  }
  ```
- **Action:** Copy `accessToken` to Postman variable `access_token`

#### Step 2: Verify Email with OTP
- **Check Terminal/Dev Logs:** Look for the OTP number printed (e.g., `Email OTP: 123456` in development mode)
- **Endpoint:** `POST /auth/verify-email-otp`
- **Headers:**
  - `Authorization: Bearer {{access_token}}`
  - `Content-Type: application/json`
- **Body:**
  ```json
  {
    "otp": "123456"
  }
  ```
- **Expected Response (200):**
  ```json
  {
    "id": "user-123",
    "email": "testuser@example.com",
    "emailVerified": true
  }
  ```

#### Step 3 (Optional): Resend OTP
- **Use Case:** User didn't receive email or OTP expired
- **Endpoint:** `POST /auth/resend-otp`
- **Headers:**
  - `Authorization: Bearer {{access_token}}`
- **Body:** Empty (no body required)
- **Expected Response (200):**
  ```json
  {
    "message": "Verification OTP sent to email"
  }
  ```

---

### **Flow 2: Email & Password Login**

#### Step 1: Login
- **Endpoint:** `POST /auth/login`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "testuser@example.com",
    "password": "TestPass123!"
  }
  ```
- **Expected Response (200):**
  ```json
  {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "learner": {
      "id": "user-123",
      "email": "testuser@example.com",
      "emailVerified": true
    }
  }
  ```
- **Action:** Copy `accessToken` to Postman variable `access_token`

#### Step 2: Verify Token Works
- **Endpoint:** `GET /auth/me` or similar existing endpoint
- **Headers:**
  - `Authorization: Bearer {{access_token}}`
- **Expected Response (200):** Your learner profile

---

### **Flow 3: Password Reset with OTP**

#### Step 1: Request Password Reset (Forgot Password)
- **Endpoint:** `POST /auth/forgot-password`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "testuser@example.com"
  }
  ```
- **Expected Response (200):**
  ```json
  {
    "message": "Password reset OTP sent to email"
  }
  ```
- **Action:** Check terminal/dev logs for the reset OTP (e.g., `Password Reset OTP: 654321`)

#### Step 2: Reset Password with OTP
- **Endpoint:** `POST /auth/reset-password`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "testuser@example.com",
    "otp": "654321",
    "newPassword": "NewTestPass456!"
  }
  ```
- **Expected Response (200):**
  ```json
  {
    "message": "Password reset successful"
  }
  ```

#### Step 3: Login with New Password
- Use "Email & Password Login" flow with new password: `NewTestPass456!`

---

### **Flow 4: Avatar Upload**

#### Upload Avatar Image
- **Endpoint:** `POST /auth/avatar`
- **Headers:**
  - `Authorization: Bearer {{access_token}}`
  - (Postman automatically sets `Content-Type: multipart/form-data`)
- **Body:** Form Data
  - Key: `avatar`
  - Type: `File`
  - Value: Select an image file (JPG, PNG, WebP, max 5MB)
- **Expected Response (200):**
  ```json
  {
    "id": "user-123",
    "email": "testuser@example.com",
    "avatarUrl": "https://res.cloudinary.com/coach-plingo/image/upload/v1234567890/coach-plingo/avatars/user-123.jpg",
    "avatarPublicId": "coach-plingo/avatars/user-123"
  }
  ```

#### Update Avatar (Replace Old One)
- Use the same endpoint again with a different image
- **Expected Behavior:** Old avatar automatically deleted from Cloudinary, new one uploaded

#### Test Changes Persisted
- Use `GET /auth/me` with Bearer token to verify `avatarUrl` is set

---

### **Flow 5: Google OAuth (Frontend-Only)*

**Note:** Google OAuth callback is handled by your frontend application, not testable directly in Postman.

#### For Testing OAuth Integration:

1. **Set Up Google OAuth Credentials**
   - Create a project in [Google Cloud Console](https://console.cloud.google.com)
   - Create OAuth 2.0 credentials (Web Application)
   - Set Authorized Redirect URIs: `http://localhost:3000/api/auth/google/callback`
   - Copy Client ID and Client Secret to `.env`:
     ```
     GOOGLE_CLIENT_ID=your-client-id
     GOOGLE_CLIENT_SECRET=your-client-secret
     GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
     ```

2. **In Your Frontend:**
   - Redirect user to: `http://localhost:3000/api/auth/google`
   - Google redirects back to: `http://localhost:3000/api/auth/google/callback?code=...`
   - Backend returns JWT tokens + learner info

3. **Backend Response Format:**
   ```json
   {
     "accessToken": "eyJhbGci...",
     "refreshToken": "eyJhbGci...",
     "learner": {
       "id": "user-oauth-123",
       "email": "user@gmail.com",
       "fullName": "Google User",
       "emailVerified": true,
       "oauthProvider": "google"
     },
     "isNewUser": true
   }
   ```

---

## Environment Variables Required for Full Testing

### Create/Update `.env` File

```env
# API Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=your-database-url

# JWT
JWT_SECRET=your-jwt-secret
JWT_EXPIRY=7d
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRY=30d

# OTP Configuration
OTP_SECRET=your-otp-secret
OTP_TTL_MINUTES=10

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@coachplingo.com

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# OpenRouter (for AI content generation)
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_APP_NAME=CoachPlingo
```

---

## Testing Checklist

### Authentication Flow Tests
- [ ] Sign up with email/password
- [ ] Resend email verification OTP
- [ ] Verify email with OTP
- [ ] Login with credentials
- [ ] Verify access token works (call protected endpoint)
- [ ] Forgot password request
- [ ] Reset password with OTP
- [ ] Login with new password
- [ ] Logout (if implemented)

### Avatar Upload Tests
- [ ] Upload avatar with JWT token
- [ ] Verify avatar URL in response
- [ ] Get user profile and verify avatar persisted
- [ ] Upload new avatar (old one should auto-delete)
- [ ] Verify old avatar removed from Cloudinary

### OAuth Tests (Frontend Integration)
- [ ] Frontend redirects to /auth/google
- [ ] User authorizes Google login
- [ ] Callback received with JWT tokens
- [ ] New OAuth user account created
- [ ] Existing email linked to OAuth

### Error Handling Tests
- [ ] Login with wrong password → 401 error
- [ ] Login with non-existent email → 401 error
- [ ] Verify wrong OTP → 400 error
- [ ] Verify expired OTP → 400 error (wait 10+ minutes)
- [ ] Upload avatar without auth → 401 error
- [ ] Upload avatar with invalid file type → 400 error
- [ ] Upload avatar exceeding 5MB → 400 error

---

## Response Status Codes Reference

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | Success | Request completed successfully |
| 201 | Created | New resource created (signup) |
| 400 | Bad Request | Invalid OTP, missing fields, file too large |
| 401 | Unauthorized | Invalid token, wrong password, token expired |
| 404 | Not Found | User not found |
| 409 | Conflict | Email already registered |
| 500 | Server Error | Internal server error (check logs) |

---

## Development Tips

### Accessing OTPs in Development
- OTPs are printed to console in development mode
- Look for: `Email OTP: 123456` or `Password Reset OTP: 654321`
- Copy the 6-digit number and use in Postman

### Resetting Test Data
```bash
# Reset database (if using Prisma)
npm run db:reset

# Or delete individual user manually via database GUI
```

### Debugging Failed Requests
1. **Check Response:** Click "Body" tab to see error message
2. **Check Headers:** Verify `Authorization: Bearer {token}` is correct
3. **Check Console:** Backend logs show detailed error info with `npm run dev`
4. **Check Env Variables:** Missing env vars will cause silent failures

### Token Expiration
- Access tokens expire after 7 days (default)
- Refresh tokens expire after 30 days
- To test token refresh, use the existing refresh endpoint (if implemented)

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "Invalid token" error | Copy new access token from login/signup response |
| "Email already in use" | Use different email or manually delete user from database |
| "OTP expired" | Request new OTP with /resend-otp or /forgot-password |
| "SMTP connection error" | Check SMTP env vars are correct; can skip with console logging in dev |
| "Cloudinary error" | Check CLOUDINARY credentials; avatars optional, won't block other tests |
| CORS errors | Ensure backend is running on correct port; check CORS config in app.ts |

---

## Next Steps After Testing

1. **Integrate with Frontend:** Use JWT tokens returned by endpoints
2. **Store Tokens Safely:** Use platform secure storage (iOS Keychain / Android Keystore-backed storage)
3. **Implement Token Refresh:** Create endpoint to refresh expired access tokens
4. **Add Rate Limiting:** Protect OTP endpoints from brute force
5. **Add Email Verification:** Production should verify emails before signup completes
6. **Logging & Monitoring:** Set up error tracking for failed auth attempts
