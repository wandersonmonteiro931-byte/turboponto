import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const url = () => process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function requireAdmin(token: string) {
  if (!token) throw new Error("Não autenticado");
  const admin = createClient(url(), serviceKey(), { auth: { persistSession: false } });
  const { data: ures, error: uerr } = await admin.auth.getUser(token);
  if (uerr || !ures.user) throw new Error("Sessão inválida");
  const uid = ures.user.id;

  const [{ data: profile }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("empresa_id").eq("id", uid).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", uid),
  ]);
  const empresaId = profile?.empresa_id as string | null;
  const isAdmin = roles?.some((r) => r.role === "admin");
  if (!empresaId || !isAdmin) throw new Error("Acesso negado");
  return { admin, empresaId, uid };
}

const FuncionarioSchema = z.object({
  token: z.string().min(10),
  nome: z.string().trim().min(2).max(120),
  cpf: z.string().trim().max(20).optional().nullable(),
  rg: z.string().trim().max(20).optional().nullable(),
  data_nascimento: z.string().optional().nullable(),
  telefone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().max(255),
  endereco: z.string().trim().max(255).optional().nullable(),
  cargo: z.string().trim().max(120).optional().nullable(),
  salario: z.number().nonnegative().optional().nullable(),
  data_admissao: z.string().optional().nullable(),
  status: z.enum(["ativo", "afastado", "desligado"]).default("ativo"),
  foto_url: z.string().url().optional().nullable(),
  observacoes: z.string().max(2000).optional().nullable(),
  senha: z.string().min(6).max(64),
});

export const criarFuncionario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => FuncionarioSchema.parse(d))
  .handler(async ({ data }) => {
    const { admin, empresaId } = await requireAdmin(data.token);

    // Create auth user
    const { data: created, error: cerr } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (cerr || !created.user) throw new Error(cerr?.message ?? "Falha ao criar usuário");
    const newUid = created.user.id;

    // Update profile (created by trigger) with empresa + cpf
    await admin
      .from("profiles")
      .update({ empresa_id: empresaId, cpf: data.cpf ?? null, nome: data.nome })
      .eq("id", newUid);

    // Role
    await admin
      .from("user_roles")
      .insert({ user_id: newUid, empresa_id: empresaId, role: "funcionario" });

    // Funcionario row
    const { data: func, error: ferr } = await admin
      .from("funcionarios")
      .insert({
        empresa_id: empresaId,
        usuario_id: newUid,
        nome: data.nome,
        cpf: data.cpf ?? null,
        rg: data.rg ?? null,
        data_nascimento: data.data_nascimento || null,
        telefone: data.telefone ?? null,
        email: data.email,
        endereco: data.endereco ?? null,
        cargo: data.cargo ?? null,
        salario: data.salario ?? null,
        data_admissao: data.data_admissao || null,
        status: data.status,
        foto_url: data.foto_url ?? null,
        observacoes: data.observacoes ?? null,
        permite_bater_ponto: data.status === "ativo",
      })
      .select()
      .single();
    if (ferr) {
      // rollback auth user
      await admin.auth.admin.deleteUser(newUid);
      throw new Error(ferr.message);
    }
    return { id: func.id };
  });

const ResetSchema = z.object({
  token: z.string().min(10),
  usuario_id: z.string().uuid(),
  senha: z.string().min(6).max(64),
});

export const resetarSenhaFuncionario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ResetSchema.parse(d))
  .handler(async ({ data }) => {
    const { admin, empresaId } = await requireAdmin(data.token);
    // Confirm funcionario belongs to admin's empresa
    const { data: f } = await admin
      .from("funcionarios")
      .select("id")
      .eq("usuario_id", data.usuario_id)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (!f) throw new Error("Funcionário não pertence à sua empresa");
    const { error } = await admin.auth.admin.updateUserById(data.usuario_id, {
      password: data.senha,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
