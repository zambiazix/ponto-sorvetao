// src/components/ConsentDialogs.jsx
import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from "@mui/material";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";

/**
 * Componente que exibe, em sequência, o Termo de Consentimento e a Política de Privacidade
 * para funcionários comuns. Grava flags no Firestore para não mostrar novamente.
 *
 * Uso:
 * <ConsentDialogs lojaId={lojaId} funcionarioId={funcionarioId} isAdmin={isAdmin} isGerente={isGerente} />
 *
 * - O componente verifica automaticamente o documento do funcionário e decide se mostra.
 * - Admin/gerente são ignorados.
 */

const DOCUMENT_VERSION = "1.0";

const termoConsentimentoTexto = `
TERMO DE CONSENTIMENTO PARA USO DE BIOMETRIA FACIAL

Pelo presente termo, declaro que AUTORIZO o uso da minha imagem e dos meus dados biométricos faciais
para fins exclusivos de controle de jornada de trabalho e registro de ponto eletrônico,
conforme a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados – LGPD).

Os dados são armazenados de forma criptografada, sem guardar fotos originais, apenas vetores numéricos derivados da face.
Posso solicitar exclusão, correção ou revogação deste consentimento a qualquer momento.
`;

const politicaPrivacidadeTexto = `
POLÍTICA DE PRIVACIDADE — CONTROLE DE PONTO BIOMÉTRICO

O sistema coleta e trata dados pessoais e biométricos apenas para controle de jornada.
Os dados são criptografados e armazenados de forma segura, sendo excluídos após 12 meses do desligamento.
O titular pode exercer seus direitos de acesso, retificação ou exclusão de dados conforme a LGPD.
`;

export default function ConsentDialogs({ lojaId, funcionarioId, isAdmin, isGerente, onAccepted }) {
  const [showConsentimento, setShowConsentimento] = useState(false);
  const [showPolitica, setShowPolitica] = useState(false);
  const [loadingCheck, setLoadingCheck] = useState(true);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      if (!lojaId || !funcionarioId || isAdmin || isGerente) {
        if (mounted) setLoadingCheck(false);
        return;
      }

      try {
        const ref = doc(db, "lojas", lojaId, "funcionarios", funcionarioId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          // Se o funcionário não existir, apenas não mostra nada
          if (mounted) setLoadingCheck(false);
          return;
        }
        const d = snap.data() || {};
        // Mostra primeiro consentimento, depois política (se necessário)
        if (!d.consentimentoFacial) {
          if (mounted) setShowConsentimento(true);
        } else if (!d.politicaPrivacidadeAceita) {
          if (mounted) setShowPolitica(true);
        }
      } catch (err) {
        console.error("ConsentDialogs: erro ao checar firestore:", err);
      } finally {
        if (mounted) setLoadingCheck(false);
      }
    };

    check();
    return () => {
      mounted = false;
    };
  }, [lojaId, funcionarioId, isAdmin, isGerente]);

  const acceptConsent = async () => {
    try {
      const ref = doc(db, "lojas", lojaId, "funcionarios", funcionarioId);
      await setDoc(
        ref,
        {
          consentimentoFacial: true,
          consentimentoAssinadoEm: new Date().toISOString(),
          versaoDocumento: DOCUMENT_VERSION,
        },
        { merge: true }
      );
      setShowConsentimento(false);
      setShowPolitica(true);
    } catch (err) {
      console.error("ConsentDialogs: erro ao salvar consentimento:", err);
      alert("Erro ao salvar consentimento. Tente novamente.");
    }
  };

  const acceptPolicy = async () => {
    try {
      const ref = doc(db, "lojas", lojaId, "funcionarios", funcionarioId);
      await setDoc(
        ref,
        {
          politicaPrivacidadeAceita: true,
          politicaAssinadaEm: new Date().toISOString(),
          versaoDocumento: DOCUMENT_VERSION,
        },
        { merge: true }
      );
      setShowPolitica(false);
      if (typeof onAccepted === "function") onAccepted();
    } catch (err) {
      console.error("ConsentDialogs: erro ao salvar política:", err);
      alert("Erro ao salvar aceitação. Tente novamente.");
    }
  };

  // nothing to render if check still running or nothing to show
  if (loadingCheck) return null;

  return (
    <>
      <Dialog open={showConsentimento} fullWidth maxWidth="sm">
        <DialogTitle>Consentimento para Uso de Biometria Facial</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
            {termoConsentimentoTexto}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowConsentimento(false)}>Cancelar</Button>
          <Button variant="contained" color="success" onClick={acceptConsent}>
            Li e Concordo
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showPolitica} fullWidth maxWidth="sm">
        <DialogTitle>Política de Privacidade — Dados Biométricos</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
            {politicaPrivacidadeTexto}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPolitica(false)}>Cancelar</Button>
          <Button variant="contained" color="success" onClick={acceptPolicy}>
            Li e Concordo
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

ConsentDialogs.propTypes = {
  lojaId: PropTypes.string.isRequired,
  funcionarioId: PropTypes.string.isRequired,
  isAdmin: PropTypes.bool,
  isGerente: PropTypes.bool,
  onAccepted: PropTypes.func,
};

ConsentDialogs.defaultProps = {
  isAdmin: false,
  isGerente: false,
  onAccepted: null,
};
