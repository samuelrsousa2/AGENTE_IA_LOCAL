// ==========================================================================
// auth/google.js — Estratégia Google OAuth 2.0
// ==========================================================================
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { queries } = require('../db/database');

function initGoogleAuth() {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.APP_URL || 'http://localhost:3000'}/auth/google/callback`,
    scope: ['profile', 'email']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const user = queries.upsertGoogleUser(profile);
      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    try {
      const user = queries.getUserById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
}

module.exports = { initGoogleAuth };
