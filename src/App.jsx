// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Painel from "./pages/Painel";
import FuncionarioPerfil from "./pages/FuncionarioPerfil";
import AdminPainel from "./pages/AdminPainel";

export default function App() {
  return (
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
      </Routes>
    </BrowserRouter>
  );
}
