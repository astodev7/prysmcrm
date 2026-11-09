import type { ApiLead, ApiClient, ApiProject, ApiTask, ApiFinance } from "./api";

// Frontend types (UI)
export type Status =
  | "Novo"
  | "Primeiro contato"
  | "Em conversa"
  | "Interessado"
  | "Proposta enviada"
  | "Em negociação"
  | "Ganho"
  | "Perdido";

export type Lead = {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  segment: string;
  source: string;
  status: Status;
  owner: string;
  ownerId?: string;
  value: number;
  probability: number;
  next: string;
  date: string;
  createdAt: string;
};

export type Client = {
  id: string;
  leadId: string;
  company: string;
  contact: string;
  value: number;
};

export type Project = {
  id: string;
  clientId: string;
  name: string;
  status: string;
  value: number;
  progress: number;
  deadline: string;
};

export type Task = {
  id: string;
  title: string;
  relation: string;
  status: string;
  priority: string;
  due: string;
};

export type Money = {
  id: string;
  name: string;
  value: number;
  status: string;
  kind: "receita" | "despesa";
  relation: string;
  createdAt: string;
};

// Status maps
const statusToApi: Record<Status, string> = {
  Novo: "NOVO",
  "Primeiro contato": "PRIMEIRO_CONTATO",
  "Em conversa": "EM_CONVERSA",
  Interessado: "INTERESSADO",
  "Proposta enviada": "PROPOSTA_ENVIADA",
  "Em negociação": "EM_NEGOCIACAO",
  Ganho: "GANHO",
  Perdido: "PERDIDO",
};

const statusFromApi: Record<string, Status> = {
  NOVO: "Novo",
  PRIMEIRO_CONTATO: "Primeiro contato",
  EM_CONVERSA: "Em conversa",
  INTERESSADO: "Interessado",
  PROPOSTA_ENVIADA: "Proposta enviada",
  EM_NEGOCIACAO: "Em negociação",
  GANHO: "Ganho",
  PERDIDO: "Perdido",
};

const projectStatusFromApi: Record<string, string> = {
  ORCAMENTO: "Orçamento",
  EM_DESENVOLVIMENTO: "Em desenvolvimento",
  EM_REVISAO: "Em revisão",
  ENTREGUE: "Entregue",
  PAUSADO: "Pausado",
  CANCELADO: "Cancelado",
};

const taskStatusFromApi: Record<string, string> = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

const taskStatusToApi: Record<string, string> = {
  Pendente: "PENDENTE",
  "Em andamento": "EM_ANDAMENTO",
  Concluída: "CONCLUIDA",
  Cancelada: "CANCELADA",
  Atrasada: "PENDENTE",
};

const priorityFromApi: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

const priorityToApi: Record<string, string> = {
  Baixa: "BAIXA",
  Média: "MEDIA",
  Alta: "ALTA",
  Urgente: "URGENTE",
};

const moneyStatusFromApi: Record<string, string> = {
  PENDENTE: "Pendente",
  PAGO: "Pago",
  ATRASADO: "Atrasado",
  CANCELADO: "Cancelado",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch {
    return "—";
  }
}

function formatDue(iso: string | null | undefined): string {
  if (!iso) return "A definir";
  try {
    const d = new Date(iso);
    const today = new Date();
    const diff = Math.floor((d.getTime() - today.setHours(0, 0, 0, 0)) / 86400000);
    if (diff < 0) return `Atrasada há ${Math.abs(diff)} dia${Math.abs(diff) > 1 ? "s" : ""}`;
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Amanhã";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch {
    return "A definir";
  }
}

export function mapLead(l: ApiLead): Lead {
  return {
    id: l.id,
    company: l.company,
    contact: l.contact,
    email: l.email || "",
    phone: l.phone || "",
    segment: l.segment || "",
    source: l.source || "",
    status: statusFromApi[l.status] || "Novo",
    owner: l.owner?.name || "—",
    ownerId: l.ownerId || undefined,
    value: Number(l.value),
    probability: l.probability,
    next: l.nextAction || "",
    date: l.nextContact ? new Date(l.nextContact).toISOString().slice(0, 10) : "",
    createdAt: l.createdAt,
  };
}

export function mapLeadToApi(lead: Partial<Lead> & { company?: string; contact?: string }) {
  const data: Record<string, unknown> = {};
  if (lead.company !== undefined) data.company = lead.company;
  if (lead.contact !== undefined) data.contact = lead.contact;
  if (lead.email !== undefined) data.email = lead.email || null;
  if (lead.phone !== undefined) data.phone = lead.phone || null;
  if (lead.phone !== undefined) data.phone = lead.phone || null;
  if (lead.segment !== undefined) data.segment = lead.segment || null;
  if (lead.source !== undefined) data.source = lead.source || null;
  if (lead.status !== undefined) data.status = statusToApi[lead.status as Status];
  if (lead.value !== undefined) data.value = lead.value;
  if (lead.probability !== undefined) data.probability = lead.probability;
  if (lead.next !== undefined) data.nextAction = lead.next || null;
  if (lead.ownerId !== undefined) data.ownerId = lead.ownerId || null;
  if (lead.date !== undefined) data.nextContact = lead.date ? new Date(lead.date).toISOString() : null;
  if (lead.date !== undefined) data.nextContact = lead.date ? new Date(lead.date).toISOString() : null;
  return data;
}

export function mapClient(c: ApiClient): Client {
  return {
    id: c.id,
    leadId: c.leadId || "",
    company: c.company,
    contact: c.contact,
    value: Number(c.value),
  };
}

export function mapProject(p: ApiProject): Project {
  return {
    id: p.id,
    clientId: p.clientId,
    name: p.name,
    status: projectStatusFromApi[p.status] || p.status,
    value: Number(p.value),
    progress: p.progress,
    deadline: formatDate(p.deadline),
  };
}

export function mapTask(t: ApiTask): Task {
  return {
    id: t.id,
    title: t.title,
    relation: t.relation || t.project?.name || "",
    status: taskStatusFromApi[t.status] || t.status,
    priority: priorityFromApi[t.priority] || t.priority,
    due: formatDue(t.dueDate),
  };
}

export function mapTaskStatusToApi(status: string): string {
  return taskStatusToApi[status] || "PENDENTE";
}

export function mapPriorityToApi(priority: string): string {
  return priorityToApi[priority] || "MEDIA";
}

export function mapFinance(f: ApiFinance): Money {
  return {
    id: f.id,
    name: f.name,
    value: Number(f.value),
    status: moneyStatusFromApi[f.status] || f.status,
    kind: f.kind === "RECEITA" ? "receita" : "despesa",
    relation: f.relation || "",
    createdAt: f.createdAt,
  };
}

export { statusToApi, statusFromApi };
