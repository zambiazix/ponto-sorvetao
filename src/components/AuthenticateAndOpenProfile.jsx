// src/components/AuthenticateAndOpenProfile.jsx
import { startAuthentication } from "@simplewebauthn/browser";
import { useNavigate } from "react-router-dom";

export default function AuthenticateAndOpenProfile({ lojaId, funcionarioId, backendUrl }) {
  const navigate = useNavigate();

  const handleAuth = async () => {
    try {
      // 1) pedir opções do servidor
      const resOptions = await fetch(`${backendUrl}/webauthn/auth/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lojaId, funcionarioId }),
      });
      const options = await resOptions.json();

      // 2) chamar a API do browser
      const assertion = await startAuthentication(options);

      // 3) enviar ao servidor para verificar
      const verifyRes = await fetch(`${backendUrl}/webauthn/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lojaId, funcionarioId, assertionResponse: assertion }),
      });

      const verifyJson = await verifyRes.json();
      if (verifyJson.verified) {
        // navega pro perfil
        navigate(`/loja/${lojaId}/funcionario/${funcionarioId}`);
      } else {
        alert("Autenticação falhou.");
      }

    } catch (err) {
      console.error(err);
      alert("Erro na autenticação: " + err.message);
    }
  };

  return (
    <button onClick={handleAuth} className="bg-black text-white px-3 py-1 rounded-lg">
      Ver perfil
    </button>
  );
}
