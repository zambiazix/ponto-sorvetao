// src/pages/Estoque.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../services/firebase";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy,
} from "firebase/firestore";
import {
  Box, Button, Card, CardActionArea, CardContent, CardMedia,
  Chip, CircularProgress, Container, IconButton, Link,
  Paper, Stack, Typography, Breadcrumbs, TextField, InputAdornment,
  Divider,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import FolderIcon from "@mui/icons-material/Folder";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import DownloadIcon from "@mui/icons-material/Download";

import CategoriaDialog from "../components/estoque/CategoriaDialog";
import SubcategoriaDialog from "../components/estoque/SubcategoriaDialog";
import ItemDialog from "../components/estoque/ItemDialog";
import MovimentacaoDialog from "../components/estoque/MovimentacaoDialog";
import ImportarItemDialog from "../components/estoque/ImportarItemDialog";
import HistoricoDialog from "../components/estoque/HistoricoDialog";
import HistoryIcon from "@mui/icons-material/History";
import { matches, fmtBRL, fmtData, hojeISO } from "../utils/estoqueUtils";

const ADMIN_UID = "mD3ie8YGmgaup2VVDpKuMBltXgp2";

export default function Estoque() {
  const { lojaId } = useParams();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState(false);
  const [isGerente, setIsGerente] = useState(false);
  const [temPermissao, setTemPermissao] = useState(false);
  const [lojaNome, setLojaNome] = useState("");
  const [usuarioEmail, setUsuarioEmail] = useState("");

  const [nivel, setNivel] = useState("categorias");
  const [categoriaSel, setCategoriaSel] = useState(null);
  const [subcategoriaSel, setSubcategoriaSel] = useState(null);

  const [categorias, setCategorias] = useState([]);
  const [subcategorias, setSubcategorias] = useState([]);
  const [todosItens, setTodosItens] = useState({}); // { itemId: item }
  const [refsSub, setRefsSub] = useState([]); // [{ itemId, ordem }]
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState("");

  // dialogs
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [catEditing, setCatEditing] = useState(null);
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [subEditing, setSubEditing] = useState(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemEditing, setItemEditing] = useState(null);
  const [movDialogOpen, setMovDialogOpen] = useState(false);
  const [movItem, setMovItem] = useState(null);
  const [impDialogOpen, setImpDialogOpen] = useState(false);
  const [histDialogOpen, setHistDialogOpen] = useState(false);
  const [histItem, setHistItem] = useState(null);

  // ============ AUTH ============
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return setTemPermissao(false);
      setUsuarioEmail(user.email || "");
      const ehAdmin = user.uid === ADMIN_UID;
      setIsAdmin(ehAdmin);
      try {
        const g = await getDoc(doc(db, "gerentes", user.uid));
        const ehGerente = g.exists();
        setIsGerente(ehGerente);
        setTemPermissao(ehAdmin || ehGerente);
      } catch {
        setIsGerente(false);
        setTemPermissao(ehAdmin);
      }
    });
    return () => unsub();
  }, []);

  // ============ LOJA ============
  useEffect(() => {
    (async () => {
      try {
        const s = await getDoc(doc(db, "lojas", lojaId));
        if (s.exists()) setLojaNome(s.data().nome || "");
      } catch (e) { console.error(e); }
    })();
  }, [lojaId]);

  // ============ CATEGORIAS ============
  const carregarCategorias = useCallback(async () => {
    setCarregando(true);
    try {
      const col = collection(db, "lojas", lojaId, "estoque_categorias");
      const snap = await getDocs(query(col, orderBy("ordem", "asc")));
      setCategorias(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setCarregando(false); }
  }, [lojaId]);

  useEffect(() => { carregarCategorias(); }, [carregarCategorias]);

  // ============ ITENS GLOBAIS ============
  const carregarTodosItens = useCallback(async () => {
    try {
      const col = collection(db, "lojas", lojaId, "estoque_itens");
      const snap = await getDocs(col);
      const map = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        // Compatibilidade: mapear campos antigos se existirem
        map[d.id] = {
          id: d.id,
          nome: data.nome || "",
          codigo: data.codigo || "",
          descricao: data.descricao || "",
          unidade: data.unidade || "un",
          quantidadeAtual:
            data.quantidadeAtual ?? data.quantidade ?? 0,
          quantidadeMinima:
            data.quantidadeMinima ?? 0,
          precoCompra:
            data.precoCompra ?? data.precoCusto ?? 0,
          dataCompra: data.dataCompra || "",
          fornecedor:
            data.fornecedor && typeof data.fornecedor === "object"
              ? data.fornecedor
              : { nome: data.fornecedor || "", contato: "" },
          imagemUrl: data.imagemUrl || "",
          historico: Array.isArray(data.historico) ? data.historico : [],
        };
      });
      setTodosItens(map);
    } catch (e) { console.error(e); }
  }, [lojaId]);

  useEffect(() => { carregarTodosItens(); }, [carregarTodosItens]);

  // ============ SUBCATEGORIAS ============
  const carregarSubcategorias = useCallback(async (catId) => {
    setCarregando(true);
    try {
      const col = collection(db, "lojas", lojaId, "estoque_categorias", catId, "subcategorias");
      const snap = await getDocs(query(col, orderBy("ordem", "asc")));
      setSubcategorias(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setCarregando(false); }
  }, [lojaId]);

  // ============ REFS DE ITENS NA SUB ============
  const carregarRefs = useCallback(async (catId, subId) => {
    setCarregando(true);
    try {
      const col = collection(
        db, "lojas", lojaId, "estoque_categorias", catId, "subcategorias", subId, "itens"
      );
      const snap = await getDocs(col);
      setRefsSub(snap.docs.map((d) => ({ refId: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setCarregando(false); }
  }, [lojaId]);

  // ============ NAVEGAÇÃO ============
  const abrirCategoria = (cat) => {
    setCategoriaSel(cat);
    setSubcategoriaSel(null);
    setNivel("subcategorias");
    setBusca("");
    carregarSubcategorias(cat.id);
  };

  const abrirSubcategoria = (sub) => {
    setSubcategoriaSel(sub);
    setNivel("produtos");
    setBusca("");
    carregarRefs(categoriaSel.id, sub.id);
  };

  const voltarNivel = () => {
    setBusca("");
    if (nivel === "produtos") {
      setSubcategoriaSel(null);
      setNivel("subcategorias");
      carregarSubcategorias(categoriaSel.id);
    } else if (nivel === "subcategorias") {
      setCategoriaSel(null);
      setNivel("categorias");
      carregarCategorias();
    }
  };

  const irParaPainel = () => {
    navigate(isAdmin ? `/admin/loja/${lojaId}` : `/loja/${lojaId}/painel`);
  };

  // ============ CRUD CATEGORIAS ============
  const salvarCategoria = async (values) => {
    try {
      if (catEditing) {
        await updateDoc(
          doc(db, "lojas", lojaId, "estoque_categorias", catEditing.id),
          { ...values, atualizadoEm: serverTimestamp() }
        );
      } else {
        const ref = doc(collection(db, "lojas", lojaId, "estoque_categorias"));
        await setDoc(ref, {
          ...values, ordem: Date.now(),
          criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
        });
      }
      setCatDialogOpen(false); setCatEditing(null);
      carregarCategorias();
    } catch (e) { console.error(e); alert("Erro ao salvar categoria."); }
  };

  const excluirCategoria = async (cat) => {
    if (!window.confirm(`Excluir "${cat.nome}"? Subcategorias e produtos serão removidos.`)) return;
    try {
      const subsCol = collection(db, "lojas", lojaId, "estoque_categorias", cat.id, "subcategorias");
      const subs = await getDocs(subsCol);
      for (const s of subs.docs) {
        const refCol = collection(
          db, "lojas", lojaId, "estoque_categorias", cat.id, "subcategorias", s.id, "itens"
        );
        const refs = await getDocs(refCol);
        for (const r of refs.docs) await deleteDoc(r.ref);
        await deleteDoc(s.ref);
      }
      await deleteDoc(doc(db, "lojas", lojaId, "estoque_categorias", cat.id));
      carregarCategorias();
    } catch (e) { console.error(e); alert("Erro ao excluir categoria."); }
  };

  // ============ CRUD SUBCATEGORIAS ============
  const salvarSubcategoria = async (values) => {
    if (!categoriaSel) return;
    try {
      const base = ["lojas", lojaId, "estoque_categorias", categoriaSel.id, "subcategorias"];
      if (subEditing) {
        await updateDoc(doc(db, ...base, subEditing.id), {
          ...values, atualizadoEm: serverTimestamp(),
        });
      } else {
        const ref = doc(collection(db, ...base));
        await setDoc(ref, {
          ...values, ordem: Date.now(),
          criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
        });
      }
      setSubDialogOpen(false); setSubEditing(null);
      carregarSubcategorias(categoriaSel.id);
    } catch (e) { console.error(e); alert("Erro ao salvar subcategoria."); }
  };

  const excluirSubcategoria = async (sub) => {
    if (!window.confirm(`Excluir "${sub.nome}"? Produtos serão desvinculados.`)) return;
    try {
      const refCol = collection(
        db, "lojas", lojaId, "estoque_categorias", categoriaSel.id,
        "subcategorias", sub.id, "itens"
      );
      const refs = await getDocs(refCol);
      for (const r of refs.docs) await deleteDoc(r.ref);
      await deleteDoc(
        doc(db, "lojas", lojaId, "estoque_categorias", categoriaSel.id, "subcategorias", sub.id)
      );
      carregarSubcategorias(categoriaSel.id);
    } catch (e) { console.error(e); alert("Erro ao excluir subcategoria."); }
  };

  // ============ CRUD ITENS ============
  const salvarItem = async (values, isEdit) => {
    if (!categoriaSel || !subcategoriaSel) return;
    try {
      if (isEdit && itemEditing) {
        await updateDoc(
          doc(db, "lojas", lojaId, "estoque_itens", itemEditing.id),
          { ...values, atualizadoEm: serverTimestamp() }
        );
        // Atualiza estado local
        setTodosItens((prev) => ({
          ...prev,
          [itemEditing.id]: { ...prev[itemEditing.id], ...values },
        }));
      } else {
        // Cria item global
        const itemRef = doc(collection(db, "lojas", lojaId, "estoque_itens"));
        const historicoInicial = [
          {
            data: values.dataCompra || hojeISO(),
            tipo: "criacao",
            quantidade: Number(values.quantidadeAtual) || 0,
            precoCompra: Number(values.precoCompra) || 0,
            motivo: "Cadastro inicial",
            usuario: usuarioEmail,
          },
        ];
        const itemPayload = {
          nome: values.nome,
          codigo: values.codigo,
          descricao: values.descricao,
          unidade: values.unidade,
          quantidadeAtual: Number(values.quantidadeAtual) || 0,
          quantidadeMinima: Number(values.quantidadeMinima) || 0,
          precoCompra: Number(values.precoCompra) || 0,
          dataCompra: values.dataCompra || hojeISO(),
          fornecedor: values.fornecedor || { nome: "", contato: "" },
          imagemUrl: values.imagemUrl || "",
          historico: historicoInicial,
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        };
        await setDoc(itemRef, itemPayload);

        // Cria ref na subcategoria
        await setDoc(
          doc(
            db, "lojas", lojaId, "estoque_categorias", categoriaSel.id,
            "subcategorias", subcategoriaSel.id, "itens", itemRef.id
          ),
          { itemId: itemRef.id, ordem: Date.now() }
        );

        await carregarTodosItens();
        await carregarRefs(categoriaSel.id, subcategoriaSel.id);
      }
      setItemDialogOpen(false);
      setItemEditing(null);
    } catch (e) { console.error(e); alert("Erro ao salvar produto."); }
  };

  const excluirRefItem = async (ref) => {
    if (!window.confirm("Remover este item desta subcategoria?")) return;
    try {
      await deleteDoc(
        doc(
          db, "lojas", lojaId, "estoque_categorias", categoriaSel.id,
          "subcategorias", subcategoriaSel.id, "itens", ref.refId
        )
      );
      // Verifica se ainda existe em outras subcategorias
      const refs = await getDocs(collection(db, "lojas", lojaId, "estoque_categorias"));
      let aindaUsado = false;
      for (const cat of refs.docs) {
        const subs = await getDocs(
          collection(db, "lojas", lojaId, "estoque_categorias", cat.id, "subcategorias")
        );
        for (const sub of subs.docs) {
          if (cat.id === categoriaSel.id && sub.id === subcategoriaSel.id) continue;
          const itSnap = await getDoc(
            doc(
              db, "lojas", lojaId, "estoque_categorias", cat.id,
              "subcategorias", sub.id, "itens", ref.refId
            )
          );
          if (itSnap.exists()) { aindaUsado = true; break; }
        }
        if (aindaUsado) break;
      }
      if (!aindaUsado) {
        if (window.confirm("Este item não está em nenhuma outra subcategoria. Excluir o cadastro global também?")) {
          await deleteDoc(doc(db, "lojas", lojaId, "estoque_itens", ref.refId));
          setTodosItens((prev) => {
            const c = { ...prev };
            delete c[ref.refId];
            return c;
          });
        }
      }
      carregarRefs(categoriaSel.id, subcategoriaSel.id);
    } catch (e) { console.error(e); alert("Erro ao remover item."); }
  };

  // ============ MOVIMENTAÇÃO ============
  const aplicarMovimentacao = async ({ tipo, quantidade, precoCompra, data, motivo }) => {
    if (!movItem) return;
    try {
      const novaQtd =
        tipo === "entrada" ? movItem.quantidadeAtual + quantidade
        : tipo === "saida" ? Math.max(0, movItem.quantidadeAtual - quantidade)
        : quantidade;

      const registro = {
        data,
        tipo,
        quantidade,
        precoCompra: precoCompra ?? movItem.precoCompra ?? 0,
        motivo: motivo || "",
        usuario: usuarioEmail,
      };

      const historico = [...(movItem.historico || []), registro];

      const update = {
        quantidadeAtual: novaQtd,
        historico,
        atualizadoEm: serverTimestamp(),
      };

      if (tipo === "entrada" && precoCompra !== undefined) {
        update.precoCompra = precoCompra;
        update.dataCompra = data;
      }

      await updateDoc(doc(db, "lojas", lojaId, "estoque_itens", movItem.id), update);

      // Atualiza estado local
      setTodosItens((prev) => ({
        ...prev,
        [movItem.id]: { ...prev[movItem.id], ...update, quantidadeAtual: novaQtd, historico },
      }));

      setMovDialogOpen(false);
      setMovItem(null);
    } catch (e) { console.error(e); alert("Erro ao movimentar estoque."); }
  };

  // ============ IMPORTAR ============
  const importarItem = async (item) => {
    if (!categoriaSel || !subcategoriaSel) return;
    try {
      await setDoc(
        doc(
          db, "lojas", lojaId, "estoque_categorias", categoriaSel.id,
          "subcategorias", subcategoriaSel.id, "itens", item.id
        ),
        { itemId: item.id, ordem: Date.now() }
      );
      setImpDialogOpen(false);
      carregarRefs(categoriaSel.id, subcategoriaSel.id);
    } catch (e) { console.error(e); alert("Erro ao importar item."); }
  };

  // ============ ABRIR DIALOGS ============
  const abrirNovaCategoria = () => { setCatEditing(null); setCatDialogOpen(true); };
  const abrirEditarCategoria = (c) => { setCatEditing(c); setCatDialogOpen(true); };
  const abrirNovaSub = () => { setSubEditing(null); setSubDialogOpen(true); };
  const abrirEditarSub = (s) => { setSubEditing(s); setSubDialogOpen(true); };
  const abrirNovoItem = () => { setItemEditing(null); setItemDialogOpen(true); };
  const abrirEditarItem = (it) => { setItemEditing(it); setItemDialogOpen(true); };
  const abrirMovItem = (it) => {
    setMovItem(it);
    setItemDialogOpen(false);
    setMovDialogOpen(true);
  };

  const abrirHistorico = (it) => {
    // Pega versão mais atualizada do item
    const atual = todosItens[it.id] || it;
    setHistItem(atual);
    setHistDialogOpen(true);
  };

  // ============ BUSCA FILTRADA ============
  const categoriasFiltradas = useMemo(
    () => categorias.filter((c) => matches(c.nome, busca) || matches(c.descricao, busca)),
    [categorias, busca]
  );
  const subcategoriasFiltradas = useMemo(
    () => subcategorias.filter((s) => matches(s.nome, busca) || matches(s.descricao, busca)),
    [subcategorias, busca]
  );

  const itensDaSub = useMemo(() => {
    const ordenados = [...refsSub].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    return ordenados
      .map((r) => ({ ...todosItens[r.itemId], refId: r.refId }))
      .filter((it) => it && it.id);
  }, [refsSub, todosItens]);

  const itensFiltrados = useMemo(
    () =>
      itensDaSub.filter(
        (it) =>
          matches(it.nome, busca) ||
          matches(it.codigo, busca) ||
          matches(it.descricao, busca) ||
          matches(it.fornecedor?.nome, busca)
      ),
    [itensDaSub, busca]
  );

  // ============ RENDER ============
  const tituloNivel =
    nivel === "categorias" ? "Categorias"
    : nivel === "subcategorias" ? `Subcategorias de ${categoriaSel?.nome || ""}`
    : `Produtos de ${subcategoriaSel?.nome || ""}`;

  const botaoNovoLabel =
    nivel === "categorias" ? "NOVA CATEGORIA"
    : nivel === "subcategorias" ? "NOVA SUBCATEGORIA"
    : "NOVO PRODUTO";

  const abrirNovo = () => {
    if (nivel === "categorias") abrirNovaCategoria();
    else if (nivel === "subcategorias") abrirNovaSub();
    else abrirNovoItem();
  };

  return (
    <Container sx={{ bgcolor: "#121212", minHeight: "100vh", py: 4, color: "white" }}>
      <Box sx={{ position: "fixed", top: 8, right: 16, color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
        Versão 1.0 - Criado por Zambiazi
      </Box>

      {/* HEADER */}
      <Stack direction="row" alignItems="center" spacing={2} mb={2} justifyContent="center">
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<ArrowBackIcon />}
          onClick={nivel === "categorias" ? irParaPainel : voltarNivel}
        >
          Voltar
        </Button>
        <Box display="flex" alignItems="center" gap={2}>
          <img src="/logo.jpg" alt="Logo" style={{ width: 48, height: 48, borderRadius: "50%" }} />
          <Typography variant="h5" sx={{ color: "#fff", fontWeight: "bold" }}>
            📦 Estoque — {lojaNome || "Loja"}
          </Typography>
        </Box>
      </Stack>

      {/* BUSCA */}
      <TextField
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar..."
        fullWidth
        sx={{ mb: 2, bgcolor: "#1a1a1a", borderRadius: 1 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: "#aaa" }} />
            </InputAdornment>
          ),
          endAdornment: busca ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setBusca("")}>
                <ClearIcon sx={{ color: "#aaa" }} />
              </IconButton>
            </InputAdornment>
          ) : null,
          style: { color: "white" },
        }}
      />

      {/* BREADCRUMBS */}
      <Breadcrumbs sx={{ mb: 2, color: "#bbb" }}>
        <Link
          underline="hover" color="inherit" sx={{ cursor: "pointer" }}
          onClick={() => {
            setNivel("categorias"); setCategoriaSel(null); setSubcategoriaSel(null);
            setBusca(""); carregarCategorias();
          }}
        >
          Categorias
        </Link>
        {categoriaSel && (
          <Link
            underline="hover" color="inherit" sx={{ cursor: "pointer" }}
            onClick={() => {
              setNivel("subcategorias"); setSubcategoriaSel(null);
              setBusca(""); carregarSubcategorias(categoriaSel.id);
            }}
          >
            {categoriaSel.nome}
          </Link>
        )}
        {subcategoriaSel && <Typography color="#fff">{subcategoriaSel.nome}</Typography>}
      </Breadcrumbs>

      {/* CABEÇALHO DO NÍVEL */}
      <Box
        sx={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          mb: 2, flexWrap: "wrap", gap: 1,
        }}
      >
        <Typography variant="h6" sx={{ textTransform: "capitalize" }}>{tituloNivel}</Typography>
        {temPermissao && (
          <Stack direction="row" spacing={1}>
            {nivel === "produtos" && (
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={() => setImpDialogOpen(true)}
              >
                IMPORTAR ITEM
              </Button>
            )}
            <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNovo}>
              {botaoNovoLabel}
            </Button>
          </Stack>
        )}
      </Box>

      {carregando ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
          <CircularProgress color="inherit" />
        </Box>
      ) : (
        <>
          {/* ===== CATEGORIAS ===== */}
          {nivel === "categorias" && (
            categoriasFiltradas.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: "center", bgcolor: "#1e1e1e" }}>
                <Typography color="#aaa">
                  {busca ? "Nenhuma categoria encontrada." : "Nenhuma categoria cadastrada."}
                </Typography>
                {!busca && temPermissao && (
                  <Button variant="contained" sx={{ mt: 2 }} startIcon={<AddIcon />} onClick={abrirNovaCategoria}>
                    CRIAR PRIMEIRA CATEGORIA
                  </Button>
                )}
              </Paper>
            ) : (
              <Box sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
                gap: 2,
              }}>
                {categoriasFiltradas.map((cat) => (
                  <Card key={cat.id} sx={{ bgcolor: "#1e1e1e", color: "white", position: "relative" }}>
                    <CardActionArea onClick={() => abrirCategoria(cat)}>
                      {cat.imagemUrl ? (
                        <CardMedia component="img" image={cat.imagemUrl} alt={cat.nome} sx={{ height: 140, objectFit: "cover" }} />
                      ) : (
                        <Box sx={{ height: 140, bgcolor: "#2a2a2a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <FolderIcon sx={{ fontSize: 56, color: "#555" }} />
                        </Box>
                      )}
                      <CardContent>
                        <Typography variant="h6" sx={{ color: "#fff" }}>{cat.nome}</Typography>
                        {cat.descricao && (
                          <Typography variant="body2" color="#bbb" sx={{ mt: 0.5 }}>{cat.descricao}</Typography>
                        )}
                      </CardContent>
                    </CardActionArea>
                    {temPermissao && (
                      <Stack direction="row" sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(0,0,0,0.5)", borderRadius: 2 }}>
                        <IconButton size="small" onClick={() => abrirEditarCategoria(cat)}><EditIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => excluirCategoria(cat)}><DeleteIcon fontSize="small" /></IconButton>
                      </Stack>
                    )}
                  </Card>
                ))}
              </Box>
            )
          )}

          {/* ===== SUBCATEGORIAS ===== */}
          {nivel === "subcategorias" && (
            subcategoriasFiltradas.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: "center", bgcolor: "#1e1e1e" }}>
                <Typography color="#aaa">
                  {busca ? "Nenhuma subcategoria encontrada." : "Nenhuma subcategoria nesta categoria."}
                </Typography>
                {!busca && temPermissao && (
                  <Button variant="contained" sx={{ mt: 2 }} startIcon={<AddIcon />} onClick={abrirNovaSub}>
                    CRIAR PRIMEIRA SUBCATEGORIA
                  </Button>
                )}
              </Paper>
            ) : (
              <Box sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
                gap: 2,
              }}>
                {subcategoriasFiltradas.map((sub) => (
                  <Card key={sub.id} sx={{ bgcolor: "#1e1e1e", color: "white", position: "relative" }}>
                    <CardActionArea onClick={() => abrirSubcategoria(sub)}>
                      {sub.imagemUrl ? (
                        <CardMedia component="img" image={sub.imagemUrl} alt={sub.nome} sx={{ height: 120, objectFit: "cover" }} />
                      ) : (
                        <Box sx={{ height: 120, bgcolor: "#2a2a2a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <FolderIcon sx={{ fontSize: 48, color: "#555" }} />
                        </Box>
                      )}
                      <CardContent>
                        <Typography variant="subtitle1" sx={{ color: "#fff" }}>{sub.nome}</Typography>
                        {sub.descricao && (
                          <Typography variant="body2" color="#bbb" sx={{ mt: 0.5 }}>{sub.descricao}</Typography>
                        )}
                      </CardContent>
                    </CardActionArea>
                    {temPermissao && (
                      <Stack direction="row" sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(0,0,0,0.5)", borderRadius: 2 }}>
                        <IconButton size="small" onClick={() => abrirEditarSub(sub)}><EditIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => excluirSubcategoria(sub)}><DeleteIcon fontSize="small" /></IconButton>
                      </Stack>
                    )}
                  </Card>
                ))}
              </Box>
            )
          )}

          {/* ===== PRODUTOS ===== */}
          {nivel === "produtos" && (
            itensFiltrados.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: "center", bgcolor: "#1e1e1e" }}>
                <Typography color="#aaa">
                  {busca ? "Nenhum produto encontrado." : "Nenhum produto nesta subcategoria."}
                </Typography>
                {!busca && temPermissao && (
                  <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }}>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNovoItem}>
                      CADASTRAR PRODUTO
                    </Button>
                    <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => setImpDialogOpen(true)}>
                      IMPORTAR EXISTENTE
                    </Button>
                  </Stack>
                )}
              </Paper>
            ) : (
              <Stack spacing={1.5}>
                {itensFiltrados.map((it) => {
                  const abaixoMin = it.quantidadeMinima > 0 && it.quantidadeAtual <= it.quantidadeMinima;
                  return (
                    <Paper key={it.id} sx={{ p: 2, bgcolor: "#1e1e1e", borderRadius: 2 }}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        {it.imagemUrl ? (
                          <Box component="img" src={it.imagemUrl} alt={it.nome}
                            sx={{ width: 72, height: 72, borderRadius: 1, objectFit: "cover" }} />
                        ) : (
                          <Box sx={{
                            width: 72, height: 72, borderRadius: 1, bgcolor: "#2a2a2a",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <Inventory2Icon sx={{ color: "#555" }} />
                          </Box>
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Typography sx={{ color: "#fff", fontWeight: "bold" }}>{it.nome}</Typography>
                            {it.codigo && <Chip size="small" label={it.codigo} sx={{ bgcolor: "#333", color: "#ddd" }} />}
                            {abaixoMin && <Chip size="small" color="error" label="ABAIXO DO MÍNIMO" />}
                          </Stack>
                          <Typography variant="body2" color="#bbb" sx={{ mt: 0.5 }}>
                            {it.quantidadeAtual} {it.unidade} • mín. {it.quantidadeMinima} {it.unidade}
                          </Typography>
                          {it.fornecedor?.nome && (
                            <Typography variant="body2" color="#999" sx={{ mt: 0.25 }}>
                              {it.fornecedor.nome}
                              {it.fornecedor.contato ? ` • ${it.fornecedor.contato}` : ""}
                            </Typography>
                          )}
                          {it.precoCompra > 0 && (
                            <Typography variant="body2" color="#999">
                              Compra {fmtBRL(it.precoCompra)}
                              {it.dataCompra ? ` em ${fmtData(it.dataCompra)}` : ""}
                            </Typography>
                          )}
                        </Box>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            color="info"
                            title="Ver histórico"
                            onClick={() => abrirHistorico(it)}
                          >
                            <HistoryIcon />
                          </IconButton>
                          {temPermissao && (
                            <>
                              <IconButton
                                color="warning"
                                title="Movimentar estoque"
                                onClick={() => abrirMovItem(it)}
                              >
                                <SwapHorizIcon />
                              </IconButton>
                              <IconButton color="primary" onClick={() => abrirEditarItem(it)}>
                                <EditIcon />
                              </IconButton>
                              <IconButton color="error" onClick={() => excluirRefItem(it)}>
                                <DeleteIcon />
                              </IconButton>
                            </>
                          )}
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )
          )}
        </>
      )}

      {/* DIALOGS */}
      <CategoriaDialog
        open={catDialogOpen}
        onClose={() => { setCatDialogOpen(false); setCatEditing(null); }}
        onSave={salvarCategoria}
        initial={catEditing}
      />
      <SubcategoriaDialog
        open={subDialogOpen}
        onClose={() => { setSubDialogOpen(false); setSubEditing(null); }}
        onSave={salvarSubcategoria}
        initial={subEditing}
      />
      <ItemDialog
        open={itemDialogOpen}
        onClose={() => { setItemDialogOpen(false); setItemEditing(null); }}
        onSave={salvarItem}
        onMovimentar={abrirMovItem}
        initial={itemEditing}
      />
      <MovimentacaoDialog
        open={movDialogOpen}
        onClose={() => { setMovDialogOpen(false); setMovItem(null); }}
        item={movItem}
        onConfirm={aplicarMovimentacao}
      />
      <ImportarItemDialog
        open={impDialogOpen}
        onClose={() => setImpDialogOpen(false)}
        todosItens={todosItens}
        idsJaNaSub={refsSub.map((r) => r.itemId)}
        onImport={importarItem}
      />
      <HistoricoDialog
        open={histDialogOpen}
        onClose={() => { setHistDialogOpen(false); setHistItem(null); }}
        item={histItem}
      />
    </Container>
  );
}