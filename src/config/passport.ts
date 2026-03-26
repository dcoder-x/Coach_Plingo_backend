import passport from 'passport';
import { Profile, Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { SimpleLogger } from '../utils/Logger';

const logger = new SimpleLogger('PassportConfig');

export interface GoogleOAuthProfilePayload {
  email: string;
  fullName: string;
  oauthProvider: 'google';
  oauthId: string;
}

function buildDisplayName(profile: Profile): string {
  if (profile.displayName?.trim()) {
    return profile.displayName.trim();
  }

  const given = profile.name?.givenName?.trim() || '';
  const family = profile.name?.familyName?.trim() || '';
  const fullName = `${given} ${family}`.trim();

  return fullName || 'Google User';
}

export function configurePassport(): void {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback';

  if (!clientID || !clientSecret) {
    logger.warn('Google OAuth is not configured. /auth/google endpoints will fail until env vars are set.');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
      },
      (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value?.toLowerCase()?.trim();

        if (!email) {
          done(new Error('Google account does not expose an email'));
          return;
        }

        const payload: GoogleOAuthProfilePayload = {
          email,
          fullName: buildDisplayName(profile),
          oauthProvider: 'google',
          oauthId: profile.id,
        };

        done(null, payload);
      },
    ),
  );
}
