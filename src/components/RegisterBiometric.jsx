// src/components/RegisterBiometric.jsx
import { startRegistration } from "@simplewebauthn/browser";

export default function RegisterBiometric({ lojaId, funcionarioId, nome, backendUrl }) {
  const handleRegister = async () => {
    try {
      // 1) pedir opções ao backend
      const optsRes = await fetch(`${backendUrl}/webauthn/register/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lojaId, funcionarioId, nome }),
      });
      const options = await optsRes.json();

      // 2) startRegistration do browser lib (converte a resposta para PublicKeyCredentialCreationOptions)
      const attResp = await startRegistration(options);

      // 3) enviar ao backend pra verificar e salvar
      const verifyRes = await fetch(`${backendUrl}/webauthn/register/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lojaId,
          funcionarioId,
          attestationResponse: attResp
        }),
      });

      const verifyJson = await verifyRes.json();
      if (verifyJson.verified) {
        alert("Biometria registrada com sucesso!");
      } else {
        alert("Falha no cadastro da biometria.");
      }

    } catch (err) {
      console.error(err);
      alert("Erro: " + err.message);
    }
  };

  return (
    <button onClick={handleRegister} className="bg-indigo-600 text-white px-3 py-1 rounded">
      Cadastrar biometria
    </button>
  );
}
