// src/components/estoque/SubcategoriaDialog.jsx
import { useEffect, useState } from "react";
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, TextField,
} from "@mui/material";
import ImagemUploadField from "./ImagemUploadField";

const EMPTY = { nome: "", descricao: "", imagemUrl: "" };

export default function SubcategoriaDialog({ open, onClose, onSave, initial }) {
  const [values, setValues] = useState(EMPTY);

  useEffect(() => {
    if (open) {
      setValues(
        initial
          ? {
              nome: initial.nome || "",
              descricao: initial.descricao || "",
              imagemUrl: initial.imagemUrl || "",
            }
          : EMPTY
      );
    }
  }, [open, initial]);

  const set = (k, v) => setValues((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!values.nome.trim()) return alert("Informe o nome da subcategoria.");
    onSave(values);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ textTransform: "uppercase", fontWeight: "bold" }}>
        {initial ? "EDITAR SUBCATEGORIA" : "NOVA SUBCATEGORIA"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="NOME"
            value={values.nome}
            onChange={(e) => set("nome", e.target.value)}
            fullWidth
            autoFocus
          />
          <TextField
            label="DESCRIÇÃO"
            value={values.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
          <ImagemUploadField
            value={values.imagemUrl}
            onChange={(v) => set("imagemUrl", v)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>CANCELAR</Button>
        <Button variant="contained" onClick={handleSave}>SALVAR</Button>
      </DialogActions>
    </Dialog>
  );
}