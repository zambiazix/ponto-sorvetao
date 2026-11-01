import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Painel from "./pages/Painel";
import FuncionarioPerfil from "./pages/FuncionarioPerfil";
import AdminPainel from "./pages/AdminPainel";
import EscalaFolgas from "./pages/EscalaFolgas";
import Estoque from "./pages/Estoque";
import EstoqueRelatorios from "./pages/EstoqueRelatorios";

import { FaceApiProvider } from "./contexts/FaceApiContext";

export default function App() {
  return (
    <FaceApiProvider>
      <BrowserRouter>
        <Routes>
        {/* Login padrão */}
        <Route path="/" element={<Login />} />

        {/* Painel do funcionário (cada loja tem seu próprio painel) */}
        <Route path="/loja/:lojaId/painel" element={<Painel />} />
        <Route
          path="/loja/:lojaId/funcionario/:funcionarioId"
          element={<FuncionarioPerfil />}
        />

        {/* Painel do ADMIN */}
        <Route path="/admin" element={<AdminPainel />} />
        <Route path="/admin/loja/:lojaId" element={<AdminPainel />} />
        <Route
          path="/admin/loja/:lojaId/funcionario/:funcionarioId"
          element={<FuncionarioPerfil />}
        />

        {/* ✅ Nova rota de Escala de Folgas */}
        <Route path="/escala-folgas" element={<EscalaFolgas funcionarios={[]} />} />

        {/* 📦 Estoque — protegido por permissão DENTRO do componente Estoque */}
        <Route path="/loja/:lojaId/estoque" element={<Estoque />} />
        <Route path="/admin/loja/:lojaId/estoque" element={<Estoque />} />
        <Route path="/loja/:lojaId/estoque/relatorios" element={<EstoqueRelatorios />} />
        <Route path="/admin/loja/:lojaId/estoque/relatorios" element={<EstoqueRelatorios />} />
          </Routes>
      </BrowserRouter>
    </FaceApiProvider>
  );
}
