// src/components/estoque/ImportarItemDialog.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  List, ListItem, ListItemButton, ListItemText, Stack, TextField, Typography,
} from "@mui/material";
import { matches } from "../../utils/estoqueUtils";

export default function ImportarItemDialog({
  open, onClose, todosItens, idsJaNaSub, onImport,
}) {
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (open) setBusca("");
  }, [open]);

  const lista = useMemo(() => Object.values(todosItens || {}), [todosItens]);

  const filtrados = useMemo(() => {
    if (!busca.trim()) return lista;
    return lista.filter(
      (it) =>
        matches(it.nome, busca) ||
        matches(it.codigo, busca) ||
        matches(it.descricao, busca) ||
        matches(it.fornecedor?.nome, busca)
    );
  }, [busca, lista]);

  const jaSet = useMemo(() => new Set(idsJaNaSub || []), [idsJaNaSub]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ textTransform: "uppercase", fontWeight: "bold" }}>
        IMPORTAR ITEM EXISTENTE
      </DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="#bbb" sx={{ display: "block", mb: 1 }}>
          Estes itens compartilham o mesmo estoque em qualquer lugar que apareçam.
        </Typography>
        <TextField
          label="BUSCAR"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          fullWidth
          autoFocus
          sx={{ mb: 2 }}
        />
        {filtrados.length === 0 ? (
          <Typography color="#888" align="center" sx={{ py: 3 }}>
            Nenhum item encontrado.
          </Typography>
        ) : (
          <List sx={{ maxHeight: 400, overflow: "auto" }}>
            {filtrados.map((it) => {
              const jaTem = jaSet.has(it.id);
              return (
                <ListItem key={it.id} disablePadding>
                  <ListItemButton
                    disabled={jaTem}
                    onClick={() => !jaTem && onImport(it)}
                  >
                    <ListItemText
                      primary={it.nome}
                      secondary={
                        <Stack direction="row" spacing={1} alignItems="center" component="span">
                          <span>{it.quantidadeAtual} {it.unidade}</span>
                          {it.codigo && <Chip size="small" label={it.codigo} />}
                          {it.fornecedor?.nome && <span>• {it.fornecedor.nome}</span>}
                        </Stack>
                      }
                    />
                    {jaTem && <Chip size="small" label="JÁ ADICIONADO" />}
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>FECHAR</Button>
      </DialogActions>
    </Dialog>
  );
}