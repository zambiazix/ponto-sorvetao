// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// UID do admin — mantenha isso sincronizado com o uid do seu admin real
const ADMIN_UID = "mD3ie8YGmgaup2VVDpKuMBltXgp2";

/**
 * Callable function: createShop
 * (mantive a sua função createShop original)
 */
exports.createShop = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuário não autenticado.");
  }
  if (context.auth.uid !== ADMIN_UID) {
    throw new functions.https.HttpsError("permission-denied", "Somente admin pode criar lojas.");
  }

  const { name, email, password } = data || {};
  if (!name || !email || !password) {
    throw new functions.https.HttpsError("invalid-argument", "name, email e password são obrigatórios.");
  }

  const lojaId = name.trim().toLowerCase().replace(/\s+/g, "-");

  try {
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: name,
      });
    } catch (err) {
      if (err.code === "auth/email-already-exists") {
        throw new functions.https.HttpsError("already-exists", "Email já existe.");
      } else {
        throw err;
      }
    }

    const db = admin.firestore();
    const lojaRef = db.collection("lojas").doc(lojaId);

    await lojaRef.set({
      nome: name,
      email,
      authUid: userRecord.uid,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, lojaId, authUid: userRecord.uid };
  } catch (err) {
    console.error("Erro createShop:", err);
    if (err.code && err.code.startsWith("auth/")) {
      throw new functions.https.HttpsError("internal", err.message);
    }
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", "Erro interno ao criar loja.");
  }
});

/**
 * Callable function: deleteShop
 * Requer:
 *  - data.lojaId (ID do documento da loja no Firestore — no seu caso é o e-mail ou o id que você usou)
 *  - opcional: data.authUid (uid do usuário Auth) ou data.email (email)
 *
 * O chamador deve estar autenticado e ser o ADMIN (checa uid).
 *
 * O que faz:
 *  - deleta o usuário Auth (se info disponível)
 *  - deleta documentos da subcoleção funcionarios/*/pontos/*
 *  - deleta documentos funcionarios/*
 *  - deleta o documento da loja (lojas/{lojaId})
 */
exports.deleteShop = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuário não autenticado.");
  }
  if (context.auth.uid !== ADMIN_UID) {
    throw new functions.https.HttpsError("permission-denied", "Somente admin pode excluir lojas.");
  }

  const { lojaId, authUid, email } = data || {};
  if (!lojaId && !authUid && !email) {
    throw new functions.https.HttpsError("invalid-argument", "Forneça lojaId, authUid ou email.");
  }

  const db = admin.firestore();

  try {
    // 1) Deleta usuário do Auth se possível
    let uidToDelete = authUid || null;
    if (!uidToDelete && email) {
      try {
        const userByEmail = await admin.auth().getUserByEmail(email);
        uidToDelete = userByEmail.uid;
      } catch (err) {
        // usuário não encontrado por email — seguimos (pode ser que não exista)
        console.warn("Usuário por email não encontrado:", email);
      }
    }

    if (uidToDelete) {
      try {
        await admin.auth().deleteUser(uidToDelete);
        console.log("Auth user deleted:", uidToDelete);
      } catch (err) {
        console.warn("Erro ao deletar usuário Auth (continuando):", err);
        // não abortamos — tentamos limpar Firestore também
      }
    }

    // 2) Deleta subcollections (funcionarios -> pontos) e documentos funcionarios
    // Observação: se houver muitas docs, isto pode demorar; aqui fazemos deletions simples.
    if (lojaId) {
      const lojaRef = db.collection("lojas").doc(lojaId);

      // buscamos funcionarios (se existir)
      const funcionariosRef = lojaRef.collection ? lojaRef.collection("funcionarios") : null;
      if (funcionariosRef) {
        const funcSnap = await funcionariosRef.get();
        for (const funcDoc of funcSnap.docs) {
          const funcId = funcDoc.id;
          const pontosRef = funcionariosRef.doc(funcId).collection("pontos");
          // deleta pontos
          const pontosSnap = await pontosRef.get();
          const batchPoints = db.batch();
          pontosSnap.docs.forEach((d) => batchPoints.delete(d.ref));
          if (pontosSnap.size > 0) await batchPoints.commit();

          // deleta funcionário
          await funcionariosRef.doc(funcId).delete();
          console.log("Funcionario deletado:", funcId);
        }
      }

      // 3) por fim, deleta o documento da loja
      await lojaRef.delete();
      console.log("Documento da loja deletado:", lojaId);
    }

    return { success: true, lojaId, deletedAuthUid: uidToDelete || null };
  } catch (err) {
    console.error("Erro deleteShop:", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", "Erro interno ao deletar loja.");
  }
});
