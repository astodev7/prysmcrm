const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  return localStorage.getItem("crm_token");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("crm_token", token);
  else localStorage.removeItem("crm_token");
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem("crm_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser | null) {
  if (user) localStorage.setItem("crm_user", JSON.stringify(user));
  else localStorage.removeItem("crm_user");
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) {
      setToken(null);
      setStoredUser(null);
    }
    throw new ApiError(data.message || "Erro na requisição", res.status);
  }

  return data as T;
}

// ===== Types (backend shape) =====
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type ApiLead = {
  id: string;
  company: string;
  contact: string;
  email: string | null;
  phone: string | null;
  segment: string | null;
  source: string | null;
  status: string;
  value: number;
  probability: number;
  nextAction: string | null;
  nextContact: string | null;
  notes: string | null;
  ownerId: string | null;
  owner?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiClient = {
  id: string;
  company: string;
  contact: string;
  email: string | null;
  phone: string | null;
  value: number;
  notes: string | null;
  leadId: string | null;
  projects?: { id: string; name: string; status: string; value: number }[];
  createdAt: string;
};

export type ApiProject = {
  id: string;
  name: string;
  status: string;
  value: number;
  progress: number;
  deadline: string | null;
  notes: string | null;
  clientId: string;
  client?: { id: string; company: string; contact?: string };
  createdAt: string;
};

export type ApiTask = {
  id: string;
  title: string;
  relation: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  notes: string | null;
  assigneeId: string | null;
  assignee?: { id: string; name: string } | null;
  projectId: string | null;
  project?: { id: string; name: string } | null;
  createdAt: string;
};

export type ApiFinance = {
  id: string;
  name: string;
  value: number;
  kind: "RECEITA" | "DESPESA";
  status: string;
  relation: string | null;
  dueDate: string | null;
  paidAt: string | null;
  category: string | null;
  notes: string | null;
  createdAt: string;
};

export type ApiCompany = {
  id: string;
  name: string;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
};

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};

// ===== Auth =====
export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    }),

  me: () => request<AuthUser>("/auth/me"),

  // Leads
  getLeads: (params?: { status?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.search) q.set("search", params.search);
    const qs = q.toString();
    return request<ApiLead[]>(`/leads${qs ? `?${qs}` : ""}`);
  },
  getLead: (id: string) => request<ApiLead>(`/leads/${id}`),
  createLead: (data: Record<string, unknown>) =>
    request<ApiLead>("/leads", { method: "POST", body: data }),
  updateLead: (id: string, data: Record<string, unknown>) =>
    request<ApiLead>(`/leads/${id}`, { method: "PUT", body: data }),
  deleteLead: (id: string) => request<void>(`/leads/${id}`, { method: "DELETE" }),
  pipelineSummary: () =>
    request<{ status: string; count: number; totalValue: number }[]>("/leads/pipeline/summary"),

  // Clients
  getClients: (search?: string) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return request<ApiClient[]>(`/clients${qs}`);
  },
  createClient: (data: Record<string, unknown>) =>
    request<ApiClient>("/clients", { method: "POST", body: data }),
  updateClient: (id: string, data: Record<string, unknown>) =>
    request<ApiClient>(`/clients/${id}`, { method: "PUT", body: data }),
  deleteClient: (id: string) => request<void>(`/clients/${id}`, { method: "DELETE" }),

  // Projects
  getProjects: (params?: { status?: string; clientId?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.clientId) q.set("clientId", params.clientId);
    const qs = q.toString();
    return request<ApiProject[]>(`/projects${qs ? `?${qs}` : ""}`);
  },
  createProject: (data: Record<string, unknown>) =>
    request<ApiProject>("/projects", { method: "POST", body: data }),
  updateProject: (id: string, data: Record<string, unknown>) =>
    request<ApiProject>(`/projects/${id}`, { method: "PUT", body: data }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),

  // Tasks
  getTasks: (params?: { status?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return request<ApiTask[]>(`/tasks${qs ? `?${qs}` : ""}`);
  },
  createTask: (data: Record<string, unknown>) =>
    request<ApiTask>("/tasks", { method: "POST", body: data }),
  updateTask: (id: string, data: Record<string, unknown>) =>
    request<ApiTask>(`/tasks/${id}`, { method: "PUT", body: data }),
  deleteTask: (id: string) => request<void>(`/tasks/${id}`, { method: "DELETE" }),

  // Finance
  getFinance: (params?: { kind?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.kind) q.set("kind", params.kind);
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return request<ApiFinance[]>(`/finance${qs ? `?${qs}` : ""}`);
  },
  financeSummary: () =>
    request<{
      totalReceitas: number;
      totalDespesas: number;
      saldo: number;
      pendentes: { count: number; value: number };
    }>("/finance/summary"),
  createFinance: (data: Record<string, unknown>) =>
    request<ApiFinance>("/finance", { method: "POST", body: data }),
  updateFinance: (id: string, data: Record<string, unknown>) =>
    request<ApiFinance>(`/finance/${id}`, { method: "PUT", body: data }),
  deleteFinance: (id: string) => request<void>(`/finance/${id}`, { method: "DELETE" }),

  // Company
  getCompany: () => request<ApiCompany | null>("/company"),
  updateCompany: (data: Record<string, unknown>) =>
    request<ApiCompany>("/company", { method: "PUT", body: data }),

  // Users
  getUsers: () => request<ApiUser[]>("/users"),
};

export { ApiError };
