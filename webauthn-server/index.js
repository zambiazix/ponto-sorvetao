// webauthn-server/index.js
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import admin from "firebase-admin";
import base64url from "base64url";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Init Firebase Admin (use service account JSON in env)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Relying Party info (customize)
const rpName = "Ponto Sorveteria";
const rpID = process.env.RPID || "localhost"; // Quando publicar, use domínio (ex: app.mysite.com)
const origin = process.env.ORIGIN || `http://${rpID}:5173`; // frontend origin (ajuste para https na produção)

// In-memory store of challenges per user (for demo). In production guarde em DB (tempo curto).
const registrationChallenges = {};
const authenticationChallenges = {};

// 1) Registration options endpoint
app.post("/webauthn/register/options", async (req, res) => {
  const { lojaId, funcionarioId, nome } = req.body;
  if (!lojaId || !funcionarioId) return res.status(400).json({ error: "Missing params" });

  // excludeCredentials - load existing credentials to avoid duplicates
  const userDoc = await db.doc(`lojas/${lojaId}/funcionarios/${funcionarioId}`).get();
  const userData = userDoc.exists ? userDoc.data() : {};
  const existingCreds = userData.webauthnCredentials || []; // array with credentialId base64url

  const excludeCredentials = existingCreds.map(c => ({
    id: base64url.toBuffer(c.credentialId),
    type: "public-key",
  }));

  const opts = generateRegistrationOptions({
    rpName,
    rpID,
    userID: `${lojaId}:${funcionarioId}`,
    userName: nome || `${funcionarioId}`,
    timeout: 60000,
    attestationType: "none",
    excludeCredentials,
    authenticatorSelection: {
      userVerification: "preferred", // requer verificação biométrica quando disponível
    },
  });

  registrationChallenges[`${lojaId}:${funcionarioId}`] = opts.challenge;
  res.json(opts);
});

// 2) Registration verification endpoint
app.post("/webauthn/register/verify", async (req, res) => {
  try {
    const { lojaId, funcionarioId, attestationResponse } = req.body;
    const expectedChallenge = registrationChallenges[`${lojaId}:${funcionarioId}`];
    if (!expectedChallenge) return res.status(400).json({ error: "No challenge found" });

    const verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    const { verified, registrationInfo } = verification;
    if (!verified || !registrationInfo) return res.status(400).json({ verified: false });

    const { credentialPublicKey, credentialID, counter } = registrationInfo;

    // store credential to Firestore on the funcionario doc
    const cred = {
      credentialId: base64url(credentialID), // store as base64url
      credentialPublicKey: base64url(credentialPublicKey),
      counter,
    };

    const funcRef = db.doc(`lojas/${lojaId}/funcionarios/${funcionarioId}`);
    await funcRef.set({
      webauthnCredentials: admin.firestore.FieldValue.arrayUnion(cred)
    }, { merge: true });

    delete registrationChallenges[`${lojaId}:${funcionarioId}`];

    res.json({ verified: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 3) Authentication options
app.post("/webauthn/auth/options", async (req, res) => {
  const { lojaId, funcionarioId } = req.body;
  if (!lojaId || !funcionarioId) return res.status(400).json({ error: "Missing params" });

  // load credentials for the user
  const userDoc = await db.doc(`lojas/${lojaId}/funcionarios/${funcionarioId}`).get();
  if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
  const creds = (userDoc.data().webauthnCredentials || []).map(c => ({
    id: base64url.toBuffer(c.credentialId),
    type: "public-key",
  }));

  const opts = generateAuthenticationOptions({
    timeout: 60000,
    allowCredentials: creds,
    userVerification: "preferred",
    rpID,
  });

  authenticationChallenges[`${lojaId}:${funcionarioId}`] = opts.challenge;
  res.json(opts);
});

// 4) Authentication verify
app.post("/webauthn/auth/verify", async (req, res) => {
  try {
    const { lojaId, funcionarioId, assertionResponse } = req.body;
    const expectedChallenge = authenticationChallenges[`${lojaId}:${funcionarioId}`];
    if (!expectedChallenge) return res.status(400).json({ error: "No challenge" });

    // find stored credential public key & counter
    const funcDoc = await db.doc(`lojas/${lojaId}/funcionarios/${funcionarioId}`).get();
    if (!funcDoc.exists) return res.status(404).json({ error: "User not found" });
    const userData = funcDoc.data();
    const credStored = (userData.webauthnCredentials || []).find(c => c.credentialId === assertionResponse.id);
    if (!credStored) return res.status(400).json({ error: "Credential not found" });

    const verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialPublicKey: base64url.toBuffer(credStored.credentialPublicKey),
        credentialID: base64url.toBuffer(credStored.credentialId),
        counter: credStored.counter || 0,
      },
    });

    if (verification.verified) {
      // update sign counter in DB
      const newCounter = verification.authenticationInfo.newCounter;
      // update stored credential counter
      const updatedCred = { ...credStored, counter: newCounter };
      // replace credential (simple approach: remove old and add new)
      await db.doc(`lojas/${lojaId}/funcionarios/${funcionarioId}`).update({
        webauthnCredentials: admin.firestore.FieldValue.arrayRemove(credStored)
      });
      await db.doc(`lojas/${lojaId}/funcionarios/${funcionarioId}`).update({
        webauthnCredentials: admin.firestore.FieldValue.arrayUnion(updatedCred)
      });

      delete authenticationChallenges[`${lojaId}:${funcionarioId}`];
      return res.json({ verified: true });
    } else {
      return res.status(400).json({ verified: false });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`WebAuthn server listening on ${PORT}`));
