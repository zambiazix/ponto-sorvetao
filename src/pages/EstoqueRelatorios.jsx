// src/pages/EstoqueRelatorios.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box, Button, Chip, CircularProgress, Container, FormControl,
  InputLabel, MenuItem, Paper, Select, Stack, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { fmtBRL } from "../utils/estoqueUtils";

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CORES = ["#4caf50", "#f44336", "#2196f3", "#ff9800", "#9c27b0", "#00bcd4", "#e91e63", "#8bc34a"];

const hojeISO = () => new Date().toISOString().slice(0, 10);
const umAnoAtras = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
};

export default function EstoqueRelatorios() {
  const { lojaId } = useParams();
  const navigate = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [mapItemCategoria, setMapItemCategoria] = useState({});

  // filtros
  const [dataInicio, setDataInicio] = useState(umAnoAtras());
  const [dataFim, setDataFim] = useState(hojeISO());
  const [catFiltro, setCatFiltro] = useState("todas");
  const [itemFiltro, setItemFiltro] = useState("todos");
  const [tipoFiltro, setTipoFiltro] = useState("todos");

  // ============ CARREGA ITENS + CATEGORIAS ============
  const carregarTudo = useCallback(async () => {
    setCarregando(true);
    try {
      // 1) Itens globais
      const colItens = collection(db, "lojas", lojaId, "estoque_itens");
      const snapItens = await getDocs(colItens);
      const listaItens = snapItens.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          nome: data.nome || "",
          unidade: data.unidade || "un",
          quantidadeAtual: data.quantidadeAtual ?? data.quantidade ?? 0,
          precoCompra: data.precoCompra ?? data.precoCusto ?? 0,
          historico: Array.isArray(data.historico) ? data.historico : [],
        };
      });
      setItens(listaItens);

      // 2) Categorias + subcategorias + refs (pra mapear itemId -> catId)
      const colCat = collection(db, "lojas", lojaId, "estoque_categorias");
      const snapCat = await getDocs(colCat);
      const cats = snapCat.docs.map((d) => ({ id: d.id, nome: d.data().nome || "" }));
      setCategorias(cats);

      const map = {};
      for (const cat of cats) {
        const subsCol = collection(db, "lojas", lojaId, "estoque_categorias", cat.id, "subcategorias");
        const subs = await getDocs(subsCol);
        for (const sub of subs.docs) {
          const refsCol = collection(
            db, "lojas", lojaId, "estoque_categorias", cat.id,
            "subcategorias", sub.id, "itens"
          );
          const refs = await getDocs(refsCol);
          refs.docs.forEach((r) => {
            const itemId = r.data().itemId || r.id;
            // Um item pode estar em várias categorias — guardamos a primeira (pode melhorar depois)
            if (!map[itemId]) map[itemId] = cat.id;
          });
        }
      }
      setMapItemCategoria(map);
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setCarregando(false);
    }
  }, [lojaId]);

  useEffect(() => { carregarTudo(); }, [carregarTudo]);

  // ============ MOVIMENTOS ACHATADOS ============
  const movimentos = useMemo(() => {
    const all = [];
    itens.forEach((it) => {
      const catId = mapItemCategoria[it.id] || "";
      (it.historico || []).forEach((h, idx) => {
        if (!h.data) return;
        all.push({
          _key: `${it.id}-${idx}`,
          itemId: it.id,
          itemNome: it.nome,
          categoriaId: catId,
          unidade: it.unidade,
          data: h.data,
          tipo: h.tipo || "ajuste",
          quantidade: Number(h.quantidade) || 0,
          precoCompra: Number(h.precoCompra) || 0,
          custoTotal:
            (h.tipo === "entrada" || h.tipo === "criacao")
              ? (Number(h.quantidade) || 0) * (Number(h.precoCompra) || 0)
              : 0,
        });
      });
    });
    return all;
  }, [itens, mapItemCategoria]);

  // ============ FILTRO APLICADO ============
  const movFiltrados = useMemo(() => {
    return movimentos.filter((m) => {
      if (dataInicio && m.data < dataInicio) return false;
      if (dataFim && m.data > dataFim) return false;
      if (catFiltro !== "todas" && m.categoriaId !== catFiltro) return false;
      if (itemFiltro !== "todos" && m.itemId !== itemFiltro) return false;
      if (tipoFiltro !== "todos") {
        if (tipoFiltro === "entrada" && !(m.tipo === "entrada" || m.tipo === "criacao")) return false;
        if (tipoFiltro === "saida" && m.tipo !== "saida") return false;
        if (tipoFiltro === "ajuste" && m.tipo !== "ajuste") return false;
      }
      return true;
    });
  }, [movimentos, dataInicio, dataFim, catFiltro, itemFiltro, tipoFiltro]);

  // ============ GRÁFICO 1 — ENTRADAS vs SAÍDAS POR MÊS ============
  const dadosPorMes = useMemo(() => {
    const map = new Map();
    movFiltrados.forEach((m) => {
      const [y, mm] = m.data.split("-");
      const key = `${y}-${mm}`;
      if (!map.has(key)) map.set(key, { key, ano: y, mes: mm, entradas: 0, saidas: 0 });
      const e = map.get(key);
      if (m.tipo === "entrada" || m.tipo === "criacao") e.entradas += m.quantidade;
      else if (m.tipo === "saida") e.saidas += m.quantidade;
    });
    return Array.from(map.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((v) => ({
        nome: `${MESES_CURTOS[Number(v.mes) - 1]}/${v.ano.slice(2)}`,
        entradas: Number(v.entradas.toFixed(2)),
        saidas: Number(v.saidas.toFixed(2)),
      }));
  }, [movFiltrados]);

  // ============ GRÁFICO 2 — ANO vs ANO ============
  const dadosAnoAno = useMemo(() => {
    const porAno = new Map();
    movFiltrados.forEach((m) => {
      const [y, mm] = m.data.split("-");
      if (!porAno.has(y)) porAno.set(y, Array(12).fill(0).map(() => ({ entrada: 0, saida: 0 })));
      const arr = porAno.get(y);
      const idx = Number(mm) - 1;
      if (m.tipo === "entrada" || m.tipo === "criacao") arr[idx].entrada += m.quantidade;
      else if (m.tipo === "saida") arr[idx].saida += m.quantidade;
    });
    const anos = Array.from(porAno.keys()).sort();
    return Array.from({ length: 12 }, (_, i) => {
      const row = { mes: MESES_CURTOS[i] };
      anos.forEach((y) => {
        row[`${y}_entrada`] = Number((porAno.get(y)[i].entrada || 0).toFixed(2));
        row[`${y}_saida`] = Number((porAno.get(y)[i].saida || 0).toFixed(2));
      });
      return row;
    });
  }, [movFiltrados]);

  const anosDisponiveis = useMemo(() => {
    const s = new Set();
    movFiltrados.forEach((m) => s.add(m.data.slice(0, 4)));
    return Array.from(s).sort();
  }, [movFiltrados]);

  // ============ GRÁFICO 3 — TOP 10 ITENS ============
  const topItens = useMemo(() => {
    const map = new Map();
    movFiltrados.forEach((m) => {
      if (!map.has(m.itemId)) map.set(m.itemId, { nome: m.itemNome, total: 0, unidade: m.unidade });
      const e = map.get(m.itemId);
      e.total += m.quantidade;
    });
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((v) => ({ nome: v.nome, total: Number(v.total.toFixed(2)) }));
  }, [movFiltrados]);

  // ============ GRÁFICO 4 — CUSTO TOTAL POR MÊS ============
  const custoPorMes = useMemo(() => {
    const map = new Map();
    movFiltrados.forEach((m) => {
      if (m.tipo !== "entrada" && m.tipo !== "criacao") return;
      const [y, mm] = m.data.split("-");
      const key = `${y}-${mm}`;
      if (!map.has(key)) map.set(key, { key, ano: y, mes: mm, custo: 0 });
      map.get(key).custo += m.custoTotal;
    });
    return Array.from(map.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((v) => ({
        nome: `${MESES_CURTOS[Number(v.mes) - 1]}/${v.ano.slice(2)}`,
        custo: Number(v.custo.toFixed(2)),
      }));
  }, [movFiltrados]);

  // ============ TOTAIS RESUMO ============
  const resumo = useMemo(() => {
    let entradas = 0, saidas = 0, custo = 0;
    movFiltrados.forEach((m) => {
      if (m.tipo === "entrada" || m.tipo === "criacao") {
        entradas += m.quantidade;
        custo += m.custoTotal;
      } else if (m.tipo === "saida") saidas += m.quantidade;
    });
    return {
      entradas: Number(entradas.toFixed(2)),
      saidas: Number(saidas.toFixed(2)),
      custo: Number(custo.toFixed(2)),
      total: movFiltrados.length,
    };
  }, [movFiltrados]);

  // opções de item dependentes da categoria
  const itensDisponiveis = useMemo(() => {
    if (catFiltro === "todas") return itens;
    return itens.filter((it) => mapItemCategoria[it.id] === catFiltro);
  }, [itens, catFiltro, mapItemCategoria]);

  return (
    <Container sx={{ bgcolor: "#121212", minHeight: "100vh", py: 4, color: "white" }}>
      <Box sx={{ position: "fixed", top: 8, right: 16, color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
        Versão 1.0 - Criado por Zambiazi
      </Box>

      {/* HEADER */}
      <Stack direction="row" alignItems="center" spacing={2} mb={3} justifyContent="center" flexWrap="wrap">
        <Button
          variant="outlined" color="secondary"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(`/loja/${lojaId}/estoque`)}
        >
          Voltar
        </Button>
        <Typography variant="h5" sx={{ color: "#fff", fontWeight: "bold" }}>
          📊 Relatórios de Estoque
        </Typography>
        <Button
          variant="outlined" color="primary"
          startIcon={<RefreshIcon />}
          onClick={carregarTudo}
          disabled={carregando}
        >
          Recarregar
        </Button>
      </Stack>

      {/* FILTROS */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: "#1e1e1e", borderRadius: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="#bbb" sx={{ display: "block", mb: 0.5 }}>
              PERÍODO
            </Typography>
            <Stack direction="row" spacing={1}>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                style={{
                  flex: 1, padding: 10, borderRadius: 6, border: "1px solid #444",
                  background: "#2a2a2a", color: "white", colorScheme: "dark",
                }}
              />
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                style={{
                  flex: 1, padding: 10, borderRadius: 6, border: "1px solid #444",
                  background: "#2a2a2a", color: "white", colorScheme: "dark",
                }}
              />
            </Stack>
          </Box>

          <FormControl sx={{ flex: 1, minWidth: 180 }} size="small">
            <InputLabel sx={{ color: "#bbb" }}>CATEGORIA</InputLabel>
            <Select
              value={catFiltro}
              label="CATEGORIA"
              onChange={(e) => { setCatFiltro(e.target.value); setItemFiltro("todos"); }}
              sx={{ color: "white", bgcolor: "#2a2a2a", "& .MuiOutlinedInput-notchedOutline": { borderColor: "#444" } }}
            >
              <MenuItem value="todas">Todas</MenuItem>
              {categorias.map((c) => <MenuItem key={c.id} value={c.id}>{c.nome}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl sx={{ flex: 1, minWidth: 180 }} size="small">
            <InputLabel sx={{ color: "#bbb" }}>ITEM</InputLabel>
            <Select
              value={itemFiltro}
              label="ITEM"
              onChange={(e) => setItemFiltro(e.target.value)}
              sx={{ color: "white", bgcolor: "#2a2a2a", "& .MuiOutlinedInput-notchedOutline": { borderColor: "#444" } }}
            >
              <MenuItem value="todos">Todos</MenuItem>
              {itensDisponiveis.map((it) => <MenuItem key={it.id} value={it.id}>{it.nome}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl sx={{ flex: 1, minWidth: 180 }} size="small">
            <InputLabel sx={{ color: "#bbb" }}>TIPO</InputLabel>
            <Select
              value={tipoFiltro}
              label="TIPO"
              onChange={(e) => setTipoFiltro(e.target.value)}
              sx={{ color: "white", bgcolor: "#2a2a2a", "& .MuiOutlinedInput-notchedOutline": { borderColor: "#444" } }}
            >
              <MenuItem value="todos">Todos</MenuItem>
              <MenuItem value="entrada">Entradas</MenuItem>
              <MenuItem value="saida">Saídas</MenuItem>
              <MenuItem value="ajuste">Ajustes</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {/* RESUMO */}
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2 }}>
          <Chip label={`${resumo.total} movimentos`} sx={{ bgcolor: "#333", color: "#fff" }} />
          <Chip label={`⬇️ Entradas: ${resumo.entradas}`} sx={{ bgcolor: "#1b5e20", color: "#fff" }} />
          <Chip label={`⬆️ Saídas: ${resumo.saidas}`} sx={{ bgcolor: "#b71c1c", color: "#fff" }} />
          <Chip label={`💰 Custo: ${fmtBRL(resumo.custo)}`} sx={{ bgcolor: "#e65100", color: "#fff" }} />
        </Stack>
      </Paper>

      {carregando ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
          <CircularProgress color="inherit" />
        </Box>
      ) : movFiltrados.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center", bgcolor: "#1e1e1e" }}>
          <Typography color="#aaa">Nenhuma movimentação encontrada para os filtros selecionados.</Typography>
        </Paper>
      ) : (
        <Stack spacing={3}>
          {/* GRÁFICO 1 */}
          <Paper sx={{ p: 2, bgcolor: "#1e1e1e", borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>📊 Entradas vs Saídas por mês</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosPorMes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="nome" stroke="#aaa" fontSize={12} />
                <YAxis stroke="#aaa" fontSize={12} />
                <Tooltip contentStyle={{ bgcolor: "#222", border: "1px solid #444", color: "#fff" }} />
                <Legend />
                <Bar dataKey="entradas" fill="#4caf50" name="Entradas" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" fill="#f44336" name="Saídas" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>

          {/* GRÁFICO 2 */}
          {anosDisponiveis.length > 1 && (
            <Paper sx={{ p: 2, bgcolor: "#1e1e1e", borderRadius: 2 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>📈 Comparação ano-a-ano</Typography>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={dadosAnoAno}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="mes" stroke="#aaa" fontSize={12} />
                  <YAxis stroke="#aaa" fontSize={12} />
                  <Tooltip contentStyle={{ bgcolor: "#222", border: "1px solid #444", color: "#fff" }} />
                  <Legend />
                  {anosDisponiveis.flatMap((y, i) => [
                    <Line
                      key={`${y}_entrada`}
                      type="monotone"
                      dataKey={`${y}_entrada`}
                      name={`${y} (entradas)`}
                      stroke={CORES[i % CORES.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />,
                    <Line
                      key={`${y}_saida`}
                      type="monotone"
                      dataKey={`${y}_saida`}
                      name={`${y} (saídas)`}
                      stroke={CORES[i % CORES.length]}
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />,
                  ])}
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          )}

          {/* GRÁFICO 3 */}
          <Paper sx={{ p: 2, bgcolor: "#1e1e1e", borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>🏆 Top 10 itens mais movimentados</Typography>
            {topItens.length === 0 ? (
              <Typography color="#888" align="center" sx={{ py: 3 }}>Sem dados.</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(300, topItens.length * 40)}>
                <BarChart data={topItens} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis type="number" stroke="#aaa" fontSize={12} />
                  <YAxis dataKey="nome" type="category" stroke="#aaa" fontSize={11} width={140} />
                  <Tooltip contentStyle={{ bgcolor: "#222", border: "1px solid #444", color: "#fff" }} />
                  <Bar dataKey="total" fill="#2196f3" name="Movimentado" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>

          {/* GRÁFICO 4 */}
          <Paper sx={{ p: 2, bgcolor: "#1e1e1e", borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>💰 Custo total de compras por mês</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={custoPorMes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="nome" stroke="#aaa" fontSize={12} />
                <YAxis stroke="#aaa" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                <Tooltip
                  contentStyle={{ bgcolor: "#222", border: "1px solid #444", color: "#fff" }}
                  formatter={(v) => fmtBRL(v)}
                />
                <Legend />
                <Line type="monotone" dataKey="custo" stroke="#ff9800" strokeWidth={3} name="Custo (R$)" dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </Paper>

          {/* GRÁFICO EXTRA — Distribuição por tipo */}
          <Paper sx={{ p: 2, bgcolor: "#1e1e1e", borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>🍩 Distribuição por tipo de movimento</Typography>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={[
                    { name: "Entradas", value: resumo.entradas, fill: "#4caf50" },
                    { name: "Saídas", value: resumo.saidas, fill: "#f44336" },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%" cy="50%" outerRadius={90}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {[<Cell key="a" fill="#4caf50" />, <Cell key="b" fill="#f44336" />]}
                </Pie>
                <Tooltip contentStyle={{ bgcolor: "#222", border: "1px solid #444", color: "#fff" }} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Stack>
      )}
    </Container>
  );
}