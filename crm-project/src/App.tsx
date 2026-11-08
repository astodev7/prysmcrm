import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileBarChart,
  KanbanSquare,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  KeyRound,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Target,
  Trash2,
  TrendingUp,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  api,
  setToken,
  setStoredUser,
  getStoredUser,
  type AuthUser,
  type ApiUser,
} from "./lib/api";
import {
  mapLead,
  mapClient,
  mapProject,
  mapTask,
  mapFinance,
  mapLeadToApi,
  mapTaskStatusToApi,
  type Lead,
  type Client,
  type Project,
  type Task,
  type Money,
  type Status,
} from "./lib/mappers";

type Page =
  | "Dashboard"
  | "Leads"
  | "Pipeline"
  | "Clientes"
  | "Projetos"
  | "Tarefas"
  | "Financeiro"
  | "Despesas"
  | "Relatórios"
  | "Configurações";

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);

const downloadCsv = (name: string, rows: string[][]) => {
  const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const body = rows.map((r) => r.map(esc).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

const stages: Status[] = [
  "Novo",
  "Primeiro contato",
  "Em conversa",
  "Interessado",
  "Proposta enviada",
  "Em negociação",
  "Ganho",
  "Perdido",
];

const nav: [Page, typeof LayoutDashboard][] = [
  ["Dashboard", LayoutDashboard],
  ["Leads", Target],
  ["Pipeline", KanbanSquare],
  ["Clientes", UsersRound],
  ["Projetos", BriefcaseBusiness],
  ["Tarefas", ListTodo],
  ["Financeiro", WalletCards],
  ["Despesas", ReceiptText],
  ["Relatórios", FileBarChart],
  ["Configurações", Settings],
];

// ===== Login =====
function LoginPage({ onLogin }: { onLogin: (user: AuthUser, token: string) => void | Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(email, password);
      await onLogin(res.user, res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shell login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <b>P</b>
          <span>
            <strong>PRYSM</strong>
            <small>gestão comercial</small>
          </span>
        </div>
        <h1>Entrar no CRM</h1>
        <p>Acesse com seu e-mail e senha.</p>
        {error && <div className="login-error">{error}</div>}
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="username"
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}

// ===== App =====
export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState<Page>("Dashboard");
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [money, setMoney] = useState<Money[]>([]);
  const [modal, setModal] = useState<"lead" | "task" | "expense" | "project" | "revenue" | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [remove, setRemove] = useState<Lead | null>(null);
  const [toast, setToast] = useState("");

  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 2400);
  };

  const handleLogin = async (u: AuthUser, token: string) => {
    setToken(token);
    setStoredUser(u);
    setUser(u);
    await loadData();
  };

  const handleLogout = () => {
    setToken(null);
    setStoredUser(null);
    setUser(null);
    setLeads([]);
    setClients([]);
    setProjects([]);
    setTasks([]);
    setMoney([]);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, clientsRes, projectsRes, tasksRes, financeRes] = await Promise.all([
        api.getLeads(),
        api.getClients(),
        api.getProjects(),
        api.getTasks(),
        api.getFinance(),
      ]);
      setLeads(leadsRes.map(mapLead));
      setClients(clientsRes.map(mapClient));
      setProjects(projectsRes.map(mapProject));
      setTasks(tasksRes.map(mapTask));
      setMoney(financeRes.map(mapFinance));
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao carregar dados");
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const stored = getStoredUser();
      if (!stored) {
        setBooting(false);
        return;
      }
      try {
        const me = await api.me();
        setUser(me);
        setStoredUser(me);
        await loadData();
      } catch {
        handleLogout();
      } finally {
        setBooting(false);
      }
    };
    init();
  }, [loadData]);

  const move = async (id: string, status: Status) => {
    const lead = leads.find((x) => x.id === id);
    if (!lead) return;
    try {
      const updated = await api.updateLead(id, mapLeadToApi({ status }));
      setLeads((v) => v.map((x) => (x.id === id ? mapLead(updated) : x)));
      if (status === "Ganho") {
        await loadData();
        notify("Cliente criado a partir do lead ganho");
      } else {
        notify(`Movido para ${status}`);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao atualizar lead");
    }
  };

  const saveLead = async (x: Lead) => {
    try {
      if (leads.some((y) => y.id === x.id)) {
        const updated = await api.updateLead(x.id, mapLeadToApi(x));
        setLeads((v) => v.map((y) => (y.id === x.id ? mapLead(updated) : y)));
      } else {
        const created = await api.createLead(mapLeadToApi(x));
        setLeads((v) => [mapLead(created), ...v]);
      }
      setModal(null);
      notify("Lead salvo com sucesso");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao salvar lead");
    }
  };

  const deleteLead = async (lead: Lead) => {
    try {
      await api.deleteLead(lead.id);
      setLeads((v) => v.filter((x) => x.id !== lead.id));
      setRemove(null);
      notify("Lead excluído");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao excluir lead");
    }
  };

  const createTask = async (title: string, relation: string) => {
    try {
      const created = await api.createTask({ title, relation });
      setTasks((v) => [mapTask(created), ...v]);
      setModal(null);
      notify("Tarefa criada");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao criar tarefa");
    }
  };

  const toggleTask = async (task: Task) => {
    const nextStatus = task.status === "Concluída" ? "Pendente" : "Concluída";
    try {
      const updated = await api.updateTask(task.id, {
        status: mapTaskStatusToApi(nextStatus),
      });
      setTasks((v) => v.map((t) => (t.id === task.id ? mapTask(updated) : t)));
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao atualizar tarefa");
    }
  };

  const createExpense = async (name: string, value: string) => {
    try {
      const created = await api.createFinance({
        name,
        value: Number(value),
        kind: "DESPESA",
        status: "PENDENTE",
        relation: "Operacional",
        category: "Operacional",
      });
      setMoney((v) => [mapFinance(created), ...v]);
      setModal(null);
      notify("Despesa registrada");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao registrar despesa");
    }
  };

  const createRevenue = async (name: string, value: string) => {
    try {
      const created = await api.createFinance({
        name,
        value: Number(value.replace(",", ".")),
        kind: "RECEITA",
        status: "PENDENTE",
        relation: "Receita",
        category: "Receita",
      });
      setMoney((v) => [mapFinance(created), ...v]);
      setModal(null);
      notify("Receita registrada");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao registrar receita");
    }
  };

  const createProject = async (name: string, clientId: string, value: string) => {
    try {
      const created = await api.createProject({
        name,
        clientId,
        value: Number((value || "0").replace(",", ".")),
        status: "EM_DESENVOLVIMENTO",
      });
      setProjects((v) => [mapProject(created), ...v]);
      setModal(null);
      notify("Projeto criado");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao criar projeto");
    }
  };

  const result = useMemo(
    () =>
      [
        ...leads
          .filter((x) => (x.company + x.contact).toLowerCase().includes(search.toLowerCase()))
          .map((x) => [x.company, "Lead"] as const),
        ...projects
          .filter((x) => x.name.toLowerCase().includes(search.toLowerCase()))
          .map((x) => [x.name, "Projeto"] as const),
      ].slice(0, 5),
    [leads, projects, search],
  );

  if (booting) {
    return (
      <div className="shell login-shell">
        <div className="login-card">
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="shell">
      {menu && <button className="shade" onClick={() => setMenu(false)} />}
      <aside className={menu ? "open" : ""}>
        <div className="brand">
          <b>P</b>
          <span>
            <strong>PRYSM</strong>
            <small>gestão comercial</small>
          </span>
        </div>
        <label>OPERAÇÃO</label>
        <nav>
          {nav.map(([n, I], i) => (
            <button
              key={n}
              className={page === n ? "active" : ""}
              onClick={() => {
                setPage(n);
                setMenu(false);
              }}
            >
              <I size={20} />
              {n}
              {n === "Tarefas" && tasks.filter((t) => t.status !== "Concluída").length > 0 && (
                <em>{tasks.filter((t) => t.status !== "Concluída").length}</em>
              )}
              {i === 5 && <i />}
            </button>
          ))}
        </nav>
        <div className="goal">
          <span>
            Meta mensal <b>—</b>
          </span>
          <i>
            <b style={{ width: "0%" }} />
          </i>
          <small>Conectado ao backend</small>
        </div>
      </aside>
      <main>
        <header>
          <button className="icon mobile" onClick={() => setMenu(true)}>
            <Menu size={22} />
          </button>
          <div className="search">
            <Search size={19} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar leads, clientes, projetos..."
            />
            {search.length > 1 && (
              <div className="results">
                {result.map(([a, b]) => (
                  <button
                    key={a}
                    onClick={() => {
                      setPage(b === "Lead" ? "Leads" : "Projetos");
                      setSearch("");
                    }}
                  >
                    <strong>{a}</strong>
                    <small>{b}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="status">{loading ? "● Sincronizando..." : "● API conectada"}</span>
          <button className="icon" title="Atualizar dados" onClick={() => loadData()}>
            <Bell size={20} />
          </button>
          <div className="user">
            <b>{initials}</b>
            <span>
              {user.name}
              <small>{user.role}</small>
            </span>
            <button className="icon" title="Sair" onClick={handleLogout} style={{ marginLeft: 5 }}>
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <section className="content">
          {page === "Dashboard" && (
            <Dashboard
              leads={leads}
              money={money}
              tasks={tasks}
              projects={projects}
              go={setPage}
              userName={user.name.split(" ")[0]}
            />
          )}
          {page === "Leads" && (
            <Leads
              leads={leads}
              move={move}
              edit={(x) => {
                setEditing(x);
                setModal("lead");
              }}
              add={() => {
                setEditing(null);
                setModal("lead");
              }}
              remove={setRemove}
            />
          )}
          {page === "Pipeline" && (
            <Pipeline leads={leads} move={move} add={() => setModal("lead")} />
          )}
          {page === "Clientes" && <Clients clients={clients} projects={projects} />}
          {page === "Projetos" && <Projects projects={projects} clients={clients} add={() => setModal("project")} />}
          {page === "Tarefas" && (
            <Tasks tasks={tasks} onToggle={toggleTask} add={() => setModal("task")} />
          )}
          {page === "Financeiro" && <Finance money={money} clients={clients} add={() => setModal("revenue")} />}
          {page === "Despesas" && <Expenses money={money} add={() => setModal("expense")} />}
          {page === "Relatórios" && <Reports leads={leads} money={money} />}
          {page === "Configurações" && <SettingsPage notify={notify} user={user} />}
        </section>
      </main>
      {modal === "lead" && (
        <LeadForm lead={editing} close={() => setModal(null)} save={saveLead} />
      )}
      {modal === "task" && (
        <QuickForm type="task" close={() => setModal(null)} save={createTask} />
      )}
      {modal === "revenue" && (
        <QuickForm type="revenue" close={() => setModal(null)} save={createRevenue} />
      )}
      {modal === "project" && (
        <ProjectForm clients={clients} close={() => setModal(null)} save={createProject} />
      )}
      {modal === "expense" && (
        <QuickForm type="expense" close={() => setModal(null)} save={createExpense} />
      )}
      {remove && (
        <Modal
          title="Excluir lead?"
          sub={`Esta ação removerá ${remove.company} do CRM.`}
          close={() => setRemove(null)}
        >
          <div className="confirm">
            <Trash2 />
            <p>Esta operação não poderá ser desfeita.</p>
            <button onClick={() => setRemove(null)}>Cancelar</button>
            <button className="danger" onClick={() => deleteLead(remove)}>
              Excluir definitivamente
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Head({
  k = "VISÃO GERAL",
  title,
  sub,
  children,
}: {
  k?: string;
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="head">
      <div>
        <label>{k}</label>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}
function Btn({
  children,
  onClick,
  plain = false,
  submit = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  plain?: boolean;
  submit?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`btn ${plain ? "plain" : ""}`}
      onClick={onClick}
      type={submit ? "submit" : "button"}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Badge({ s }: { s: string }) {
  return (
    <span
      className={`badge ${s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replaceAll(" ", "-")}`}
    >
      <i />
      {s}
    </span>
  );
}
function Metric({ name, value, Icon }: { name: string; value: string; Icon: typeof Target }) {
  return (
    <article className="metric">
      <span>
        {name}
        <i>
          <Icon size={19} />
        </i>
      </span>
      <strong>{value}</strong>
      <small>
        ↗ dados da API <em>em tempo real</em>
      </small>
    </article>
  );
}
function PanelHead({ title, sub, onMore }: { title: string; sub: string; onMore?: () => void }) {
  return (
    <div className="panelhead">
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
      {onMore && (
        <button type="button" onClick={onMore}>
          Ver detalhes ›
        </button>
      )}
    </div>
  );
}

function Dashboard({
  leads,
  money,
  tasks,
  projects,
  go,
  userName,
}: {
  leads: Lead[];
  money: Money[];
  tasks: Task[];
  projects: Project[];
  go: (p: Page) => void;
  userName: string;
}) {
  const rec = money
      .filter((x) => x.kind === "receita" && x.status === "Pago")
      .reduce((s, x) => s + x.value, 0),
    exp = money
      .filter((x) => x.kind === "despesa" && x.status === "Pago")
      .reduce((s, x) => s + x.value, 0),
    pipe = leads
      .filter((x) => !["Ganho", "Perdido"].includes(x.status))
      .reduce((s, x) => s + x.value, 0);
  const conv =
    leads.length > 0
      ? Math.round((leads.filter((x) => x.status === "Ganho").length / leads.length) * 100)
      : 0;
  return (
    <>
      <Head title={`Bom dia, ${userName}`} sub="Aqui está o pulso da sua operação hoje.">
        <Btn
          plain
          onClick={() =>
            downloadCsv("leads.csv", [
              ["Empresa", "Contato", "Status", "Valor", "Probabilidade"],
              ...leads.map((x) => [x.company, x.contact, x.status, String(x.value), String(x.probability)]),
            ])
          }
        >
          <Download size={18} /> Exportar leads
        </Btn>
      </Head>
      <div className="metrics">
        <Metric name="Pipeline ativo" value={brl(pipe)} Icon={Target} />
        <Metric name="Receita recebida" value={brl(rec)} Icon={CircleDollarSign} />
        <Metric name="Lucro realizado" value={brl(rec - exp)} Icon={TrendingUp} />
        <Metric name="Taxa de conversão" value={`${conv}%`} Icon={BarChart3} />
      </div>
      <div className="dash">
        <article className="panel chart">
          <PanelHead title="Desempenho financeiro" sub="Receitas, despesas e lucro realizado" onMore={() => go("Financeiro")} />
          <div className="chartnums">
            <span>
              Receita <b>{brl(rec)}</b>
            </span>
            <span>
              Despesas <b>{brl(exp)}</b>
            </span>
            <span>
              Lucro <b>{brl(rec - exp)}</b>
            </span>
          </div>
          <svg viewBox="0 0 700 180" preserveAspectRatio="none">
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#a8ff3e" stopOpacity=".25" />
                <stop offset="1" stopColor="#a8ff3e" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 150 L65 130 L130 140 L195 96 L260 108 L325 72 L390 82 L455 46 L520 62 L585 28 L650 40 L700 18 L700 180 L0 180Z"
              fill="url(#g)"
            />
            <path
              d="M0 150 L65 130 L130 140 L195 96 L260 108 L325 72 L390 82 L455 46 L520 62 L585 28 L650 40 L700 18"
              fill="none"
              stroke="#a8ff3e"
              strokeWidth="2"
            />
          </svg>
        </article>
        <article className="panel funnel">
          <PanelHead title="Funil de vendas" sub={`${leads.length} oportunidades no período`} onMore={() => go("Pipeline")} />
          {["Novo", "Interessado", "Proposta enviada", "Em negociação", "Ganho"].map((s, i) => {
            const n = leads.filter((x) => (i === 0 ? true : x.status === s)).length;
            return (
              <div key={s}>
                <span>
                  {s}
                  <b>{i === 0 ? leads.length : n}</b>
                </span>
                <i>
                  <b style={{ width: `${100 - i * 18}%` }} />
                </i>
              </div>
            );
          })}
        </article>
      </div>
      <div className="twocol">
        <article className="panel">
          <PanelHead title="Próximas ações" sub="Itens que precisam da sua atenção" onMore={() => go("Tarefas")} />
          <div className="rows">
            {tasks.slice(0, 5).map((x) => (
              <div key={x.id}>
                <Clock />
                <span>
                  <strong>{x.title}</strong>
                  <small>
                    {x.relation} · {x.due}
                  </small>
                </span>
                <Badge s={x.status} />
              </div>
            ))}
            {tasks.length === 0 && <p className="note">Nenhuma tarefa pendente.</p>}
          </div>
        </article>
        <article className="panel">
          <PanelHead title="Projetos em andamento" sub={`${projects.length} projetos`} onMore={() => go("Projetos")} />
          <div className="rows proj">
            {projects.slice(0, 5).map((x) => (
              <div key={x.id}>
                <span>
                  <strong>{x.name}</strong>
                  <small>
                    {x.status} · {x.progress}%
                  </small>
                </span>
                <strong>{brl(x.value)}</strong>
                <i>
                  <b style={{ width: `${x.progress}%` }} />
                </i>
              </div>
            ))}
            {projects.length === 0 && <p className="note">Nenhum projeto ainda.</p>}
          </div>
          <div className="panel-foot">
            <button type="button" className="btn plain" onClick={() => go("Projetos")}>
              Ver todos os projetos
            </button>
          </div>
        </article>
      </div>
    </>
  );
}
function Clock() {
  return (
    <i className="clock">
      <CalendarDays size={17} />
    </i>
  );
}
function Leads({
  leads,
  move: _move,
  edit,
  add,
  remove,
}: {
  leads: Lead[];
  move: (id: string, status: Status) => void;
  edit: (l: Lead) => void;
  add: () => void;
  remove: (l: Lead) => void;
}) {
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("Todos");
  const filtered = leads.filter(
    (x) =>
      (status === "Todos" || x.status === status) &&
      (x.company + x.contact).toLowerCase().includes(q.toLowerCase()),
  );
  const csv = () => {
    downloadCsv("leads.csv", [
      ["Empresa", "Contato", "Status", "Valor", "Probabilidade"],
      ...filtered.map((x) => [x.company, x.contact, x.status, String(x.value), String(x.probability)]),
    ]);
  };
  return (
    <>
      <Head k="COMERCIAL" title="Leads" sub={`${leads.length} oportunidades registradas na base.`}>
        <Btn plain onClick={csv}>
          <Download size={18} /> Exportar
        </Btn>
        <Btn onClick={add}>
          <Plus size={19} /> Novo lead
        </Btn>
      </Head>
      <div className="strip">
        <span>
          Total de leads<b>{leads.length}</b>
        </span>
        <span>
          Em negociação<b>{leads.filter((x) => x.status === "Em negociação").length}</b>
        </span>
        <span>
          Valor em aberto
          <b>{brl(leads.filter((x) => x.status !== "Ganho").reduce((s, x) => s + x.value, 0))}</b>
        </span>
      </div>
      <article className="panel table">
        <div className="tools">
          <div>
            <Search size={18} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar empresa ou contato"
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>Todos</option>
            {stages.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <Table leads={filtered} edit={edit} remove={remove} />
      </article>
    </>
  );
}
function Table({
  leads,
  edit,
  remove,
}: {
  leads: Lead[];
  edit: (l: Lead) => void;
  remove: (l: Lead) => void;
}) {
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>EMPRESA / CONTATO</th>
            <th>STATUS</th>
            <th>ORIGEM</th>
            <th>RESPONSÁVEL</th>
            <th>PRÓXIMA AÇÃO</th>
            <th>VALOR</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {leads.map((x) => (
            <tr key={x.id}>
              <td>
                <div className="entity">
                  <b>{x.company[0]}</b>
                  <span>
                    <strong>{x.company}</strong>
                    <small>
                      {x.contact} · {x.segment}
                    </small>
                  </span>
                </div>
              </td>
              <td>
                <Badge s={x.status} />
              </td>
              <td>{x.source}</td>
              <td>{x.owner}</td>
              <td>
                <strong>{x.next}</strong>
                <small>{x.date}</small>
              </td>
              <td>
                <strong>{brl(x.value)}</strong>
                <small>{x.probability}% prob.</small>
              </td>
              <td>
                <button type="button" onClick={() => edit(x)}>
                  Editar
                </button>
                <button type="button" onClick={() => remove(x)}>
                  <Trash2 size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pipeline({
  leads,
  move,
  add,
}: {
  leads: Lead[];
  move: (id: string, status: Status) => void;
  add: () => void;
}) {
  return (
    <>
      <Head
        k="COMERCIAL"
        title="Pipeline de vendas"
        sub="Arraste oportunidades entre etapas para atualizar o funil."
      >
        <Btn onClick={add}>
          <Plus size={19} /> Nova oportunidade
        </Btn>
      </Head>
      <div className="strip">
        <span>
          Pipeline total
          <b>
            {brl(
              leads
                .filter((x) => !["Ganho", "Perdido"].includes(x.status))
                .reduce((s, x) => s + x.value, 0),
            )}
          </b>
        </span>
        <span>
          Oportunidades ativas
          <b>{leads.filter((x) => !["Ganho", "Perdido"].includes(x.status)).length}</b>
        </span>
        <span>
          Conversão
          <b>
            {leads.length
              ? Math.round((leads.filter((x) => x.status === "Ganho").length / leads.length) * 100)
              : 0}
            %
          </b>
        </span>
      </div>
      <div className="kanban">
        {stages.map((s) => (
          <section
            key={s}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => move(e.dataTransfer.getData("id"), s)}
          >
            <header>
              <strong>
                {s}
                <em>{leads.filter((x) => x.status === s).length}</em>
              </strong>
              <span>
                {brl(leads.filter((x) => x.status === s).reduce((a, x) => a + x.value, 0))}
              </span>
            </header>
            {leads
              .filter((x) => x.status === s)
              .map((x) => (
                <article
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("id", x.id)}
                  key={x.id}
                >
                  <div>
                    <b>{x.company[0]}</b>
                    <span>
                      <strong>{x.company}</strong>
                      <small>{x.contact}</small>
                    </span>
                  </div>
                  <footer>
                    <em>{x.owner}</em>
                    <strong>{brl(x.value)}</strong>
                  </footer>
                </article>
              ))}
          </section>
        ))}
      </div>
    </>
  );
}
function Clients({ clients, projects }: { clients: Client[]; projects: Project[] }) {
  return (
    <>
      <Head k="COMERCIAL" title="Clientes" sub={`${clients.length} clientes ativos.`}>
        <Btn
          plain
          onClick={() =>
            downloadCsv("clientes.csv", [
              ["Empresa", "Contato", "Valor"],
              ...clients.map((x) => [x.company, x.contact, String(x.value)]),
            ])
          }
        >
          <Download size={18} /> Exportar
        </Btn>
      </Head>
      <article className="panel table">
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>EMPRESA</th>
                <th>CONTATO</th>
                <th>PROJETOS</th>
                <th>VALOR</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((x) => (
                <tr key={x.id}>
                  <td>
                    <div className="entity">
                      <b>{x.company[0]}</b>
                      <strong>{x.company}</strong>
                    </div>
                  </td>
                  <td>{x.contact}</td>
                  <td>{projects.filter((p) => p.clientId === x.id).length}</td>
                  <td>
                    <strong>{brl(x.value)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}
function Projects({ projects, clients, add }: { projects: Project[]; clients: Client[]; add: () => void }) {
  return (
    <>
      <Head k="OPERAÇÃO" title="Projetos" sub={`${projects.length} projetos em gestão.`}>
        <Btn onClick={add}>
          <Plus size={19} /> Novo projeto
        </Btn>
      </Head>
      <article className="panel">
        {projects.map((x) => (
          <div className="project" key={x.id}>
            <span>
              <strong>{x.name}</strong>
              <small>{clients.find((c) => c.id === x.clientId)?.company}</small>
            </span>
            <Badge s={x.status} />
            <span className="grow">
              Progresso <b>{x.progress}%</b>
              <i>
                <b style={{ width: `${x.progress}%` }} />
              </i>
            </span>
            <strong>
              {brl(x.value)}
              <small>Prazo {x.deadline}</small>
            </strong>
          </div>
        ))}
        {projects.length === 0 && <p className="note">Nenhum projeto cadastrado.</p>}
      </article>
    </>
  );
}
function Tasks({
  tasks,
  onToggle,
  add,
}: {
  tasks: Task[];
  onToggle: (t: Task) => void;
  add: () => void;
}) {
  return (
    <>
      <Head k="ACOMPANHAMENTO" title="Tarefas" sub="Prioridades comerciais e operacionais.">
        <Btn onClick={add}>
          <Plus size={19} /> Nova tarefa
        </Btn>
      </Head>
      <div className="taskboard">
        {["Atrasada", "Pendente", "Em andamento", "Concluída"].map((s) => (
          <section key={s}>
            <header>
              {s}
              <em>{tasks.filter((x) => x.status === s).length}</em>
            </header>
            {tasks
              .filter((x) => x.status === s)
              .map((x) => (
                <article key={x.id}>
                  <button type="button" onClick={() => onToggle(x)}>
                    {x.status === "Concluída" && <Check size={14} />}
                  </button>
                  <span>
                    <strong>{x.title}</strong>
                    <small>{x.relation}</small>
                    <footer>
                      <em>{x.priority}</em>
                      {x.due}
                    </footer>
                  </span>
                </article>
              ))}
          </section>
        ))}
      </div>
    </>
  );
}
function Finance({ money, clients, add }: { money: Money[]; clients: Client[]; add: () => void }) {
  const rec = money.filter((x) => x.kind === "receita"),
    exp = money.filter((x) => x.kind === "despesa"),
    paid = rec.filter((x) => x.status === "Pago").reduce((s, x) => s + x.value, 0),
    cost = exp.filter((x) => x.status === "Pago").reduce((s, x) => s + x.value, 0);
  return (
    <>
      <Head
        k="FINANCEIRO"
        title="Visão financeira"
        sub="Contrato, faturamento e caixa tratados separadamente."
      >
        <Btn onClick={add}>
          <Plus size={19} /> Nova receita
        </Btn>
      </Head>
      <div className="metrics four">
        <Metric
          name="Total vendido"
          value={brl(clients.reduce((s, x) => s + x.value, 0))}
          Icon={BriefcaseBusiness}
        />
        <Metric name="Efetivamente recebido" value={brl(paid)} Icon={CircleDollarSign} />
        <Metric name="Despesas pagas" value={brl(cost)} Icon={WalletCards} />
        <Metric name="Lucro realizado" value={brl(paid - cost)} Icon={TrendingUp} />
      </div>
      <MoneyTable data={rec} />
      <p className="note">
        ● Lucro realizado considera apenas receitas recebidas menos despesas pagas.
      </p>
    </>
  );
}
function Expenses({ money, add }: { money: Money[]; add: () => void }) {
  const data = money.filter((x) => x.kind === "despesa");
  return (
    <>
      <Head k="FINANCEIRO" title="Despesas" sub="Custos operacionais e de projetos.">
        <Btn onClick={add}>
          <Plus size={19} /> Nova despesa
        </Btn>
      </Head>
      <div className="strip">
        <span>
          Total<b>{brl(data.reduce((s, x) => s + x.value, 0))}</b>
        </span>
        <span>
          Pago<b>{brl(data.filter((x) => x.status === "Pago").reduce((s, x) => s + x.value, 0))}</b>
        </span>
        <span>
          Pendente
          <b>{brl(data.filter((x) => x.status !== "Pago").reduce((s, x) => s + x.value, 0))}</b>
        </span>
      </div>
      <MoneyTable data={data} />
    </>
  );
}
function MoneyTable({ data }: { data: Money[] }) {
  return (
    <article className="panel table">
      <div className="panelhead">
        <div>
          <h2>Registros financeiros</h2>
          <p>Valores vinculados à operação</p>
        </div>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>DESCRIÇÃO</th>
              <th>VÍNCULO</th>
              <th>STATUS</th>
              <th>VALOR</th>
            </tr>
          </thead>
          <tbody>
            {data.map((x) => (
              <tr key={x.id}>
                <td>
                  <strong>{x.name}</strong>
                </td>
                <td>{x.relation}</td>
                <td>
                  <Badge s={x.status} />
                </td>
                <td>
                  <strong className={x.kind === "despesa" ? "neg" : ""}>
                    {x.kind === "despesa" ? "−" : ""}
                    {brl(x.value)}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
function Reports({ leads, money }: { leads: Lead[]; money: Money[] }) {
  const ganho = leads.filter((x) => x.status === "Ganho").length;
  const rec = money.filter((x) => x.kind === "receita" && x.status === "Pago").reduce((s, x) => s + x.value, 0);
  return (
    <>
      <Head k="ANÁLISE" title="Relatórios" sub="Indicadores consolidados da operação." />
      <div className="metrics">
        <Metric name="Leads totais" value={String(leads.length)} Icon={Target} />
        <Metric name="Ganhos" value={String(ganho)} Icon={Check} />
        <Metric
          name="Conversão"
          value={`${leads.length ? Math.round((ganho / leads.length) * 100) : 0}%`}
          Icon={BarChart3}
        />
        <Metric name="Receita paga" value={brl(rec)} Icon={CircleDollarSign} />
      </div>
      <article className="panel">
        <PanelHead title="Por origem" sub="Distribuição de leads" />
        <div className="rows">
          {Object.entries(
            leads.reduce(
              (acc, l) => {
                acc[l.source || "Outros"] = (acc[l.source || "Outros"] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            ),
          ).map(([k, v]) => (
            <div key={k}>
              <strong>{k}</strong>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </article>
    </>
  );
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  COMERCIAL: "Comercial",
  FINANCEIRO: "Financeiro",
  OPERACIONAL: "Operacional",
};

type SettingsTab = "empresa" | "usuarios" | "senha" | "breve";

function SettingsPage({ notify, user }: { notify: (s: string) => void; user: AuthUser }) {
  const isAdmin = user.role === "ADMIN";
  const [tab, setTab] = useState<SettingsTab>("empresa");
  const [soon, setSoon] = useState("");

  const items: { id: SettingsTab; label: string; Icon: typeof UserRound; hidden?: boolean; soon?: boolean }[] = [
    { id: "empresa", label: "Dados da empresa", Icon: UserRound },
    { id: "usuarios", label: "Usuários e permissões", Icon: UsersRound, hidden: !isAdmin },
    { id: "senha", label: "Minha senha", Icon: KeyRound },
    { id: "breve", label: "Status do pipeline", Icon: KanbanSquare, soon: true },
    { id: "breve", label: "Categorias financeiras", Icon: WalletCards, soon: true },
    { id: "breve", label: "Pacotes de serviços", Icon: BriefcaseBusiness, soon: true },
    { id: "breve", label: "Notificações", Icon: Bell, soon: true },
  ];

  return (
    <>
      <Head k="ADMINISTRAÇÃO" title="Configurações" sub="Personalize o CRM e o acesso da equipe." />
      <div className="settings">
        <nav>
          {items
            .filter((it) => !it.hidden)
            .map((it) => (
              <button
                className={(it.soon ? soon === it.label : tab === it.id) ? "active" : ""}
                key={it.label}
                type="button"
                onClick={() => {
                  setTab(it.id);
                  setSoon(it.soon ? it.label : "");
                }}
              >
                <it.Icon size={23} /> {it.label}
              </button>
            ))}
        </nav>
        {tab === "empresa" && <CompanyPanel notify={notify} canEdit={isAdmin} />}
        {tab === "usuarios" && isAdmin && <UsersPanel notify={notify} me={user} />}
        {tab === "senha" && <PasswordPanel notify={notify} />}
        {tab === "breve" && (
          <article className="panel form">
            <h2>{soon}</h2>
            <p>Esta configuração ainda não está disponível.</p>
          </article>
        )}
      </div>
    </>
  );
}

function CompanyPanel({ notify, canEdit }: { notify: (s: string) => void; canEdit: boolean }) {
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getCompany()
      .then((c) => {
        if (c) {
          setName(c.name || "");
          setCnpj(c.cnpj || "");
          setEmail(c.email || "");
          setAddress(c.address || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateCompany({ name, cnpj, email, address });
      notify("Dados da empresa salvos");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="panel form">
      <h2>Dados da empresa</h2>
      <p>Informações usadas em propostas e relatórios.</p>
      {loading ? (
        <p>Carregando...</p>
      ) : (
        <>
          <label>
            Nome da empresa
            <input value={name} onChange={(e) => setName(e.target.value)} readOnly={!canEdit} />
          </label>
          <div>
            <label>
              CNPJ
              <input
                placeholder="00.000.000/0001-00"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                readOnly={!canEdit}
              />
            </label>
            <label>
              E-mail
              <input value={email} onChange={(e) => setEmail(e.target.value)} readOnly={!canEdit} />
            </label>
          </div>
          <label>
            Endereço
            <input value={address} onChange={(e) => setAddress(e.target.value)} readOnly={!canEdit} />
          </label>
          {canEdit ? (
            <Btn onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar alterações"}
            </Btn>
          ) : (
            <small>Somente administradores podem alterar os dados da empresa.</small>
          )}
        </>
      )}
    </article>
  );
}

function PasswordPanel({ notify }: { notify: (s: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (next !== confirm) {
      setError("A confirmação não é igual à nova senha.");
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      notify("Senha alterada com sucesso");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao alterar a senha");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel form" onSubmit={submit}>
      <h2>Minha senha</h2>
      <p>Use pelo menos 8 caracteres.</p>
      {error && <div className="login-error">{error}</div>}
      <label>
        Senha atual
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      <label>
        Nova senha
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <label>
        Confirmar nova senha
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <Btn submit disabled={saving}>
        {saving ? "Salvando..." : "Alterar senha"}
      </Btn>
    </form>
  );
}

function UsersPanel({ notify, me }: { notify: (s: string) => void; me: AuthUser }) {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ user: ApiUser | null } | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await api.getUsers());
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = async (u: ApiUser) => {
    try {
      const updated = await api.updateUser(u.id, { active: !u.active });
      setUsers((v) => v.map((x) => (x.id === u.id ? { ...x, ...updated } : x)));
      notify(updated.active ? `${u.name} reativado(a)` : `${u.name} desativado(a)`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao atualizar usuário");
    }
  };

  return (
    <article className="panel users">
      <header>
        <span>
          <h2>Usuários e permissões</h2>
          <p>Crie o acesso real de cada pessoa da equipe e defina o perfil dela.</p>
        </span>
        <Btn onClick={() => setForm({ user: null })}>
          <Plus size={18} /> Novo usuário
        </Btn>
      </header>
      {loading ? (
        <p>Carregando...</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>USUÁRIO</th>
                <th>PERFIL</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="entity">
                      <b>{u.name[0]?.toUpperCase()}</b>
                      <span>
                        <strong>
                          {u.name}
                          {u.id === me.id ? " (você)" : ""}
                        </strong>
                        <small>{u.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>{ROLE_LABEL[u.role] ?? u.role}</td>
                  <td>
                    <span className={`badge ${u.active ? "ganho" : "perdido"}`}>
                      <i />
                      {u.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <button type="button" onClick={() => setForm({ user: u })}>
                      Editar
                    </button>
                    {u.id !== me.id && (
                      <button type="button" onClick={() => toggleActive(u)}>
                        {u.active ? "Desativar" : "Reativar"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <UserForm
          user={form.user}
          close={() => setForm(null)}
          onSaved={(saved, created) => {
            setUsers((v) =>
              created ? [...v, saved].sort((a, b) => a.name.localeCompare(b.name)) : v.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)),
            );
            setForm(null);
            notify(created ? "Usuário criado" : "Usuário atualizado");
          }}
        />
      )}
    </article>
  );
}

function UserForm({
  user,
  close,
  onSaved,
}: {
  user: ApiUser | null;
  close: () => void;
  onSaved: (u: ApiUser, created: boolean) => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState(user?.role ?? "COMERCIAL");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (user) {
        const data: { name: string; email: string; role: string; password?: string } = { name, email, role };
        if (password) data.password = password;
        onSaved(await api.updateUser(user.id, data), false);
      } else {
        onSaved(await api.createUser({ name, email, role, password }), true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar usuário");
      setSaving(false);
    }
  };

  return (
    <Modal
      title={user ? "Editar usuário" : "Novo usuário"}
      sub={user ? "Altere os dados ou redefina a senha." : "A pessoa entra com este e-mail e senha."}
      close={close}
    >
      <form className="modalform" onSubmit={submit}>
        {error && <div className="login-error wide">{error}</div>}
        <label>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </label>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Perfil
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          {user ? "Nova senha (opcional)" : "Senha"}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!user}
            minLength={8}
            placeholder={user ? "Deixe em branco para manter" : "Mínimo de 8 caracteres"}
            autoComplete="new-password"
          />
        </label>
        <footer>
          <Btn plain onClick={close}>
            Cancelar
          </Btn>
          <Btn submit disabled={saving}>
            {saving ? "Salvando..." : user ? "Salvar alterações" : "Criar usuário"}
          </Btn>
        </footer>
      </form>
    </Modal>
  );
}

function Modal({
  title,
  sub,
  close,
  children,
}: {
  title: string;
  sub: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="backdrop">
      <section className="modal">
        <header>
          <span>
            <h2>{title}</h2>
            <p>{sub}</p>
          </span>
          <button type="button" onClick={close}>
            <X size={22} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function LeadForm({
  lead,
  close,
  save,
}: {
  lead: Lead | null;
  close: () => void;
  save: (l: Lead) => void;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    save({
      id: lead?.id || "",
      company: String(d.get("company")),
      contact: String(d.get("contact")),
      email: String(d.get("email")),
      segment: String(d.get("segment")),
      source: String(d.get("source")),
      status: String(d.get("status")) as Status,
      owner: String(d.get("owner")),
      value: Number(d.get("value")),
      probability: Number(d.get("probability")),
      next: String(d.get("next")),
      date: String(d.get("date")),
    });
  };
  return (
    <Modal
      title={lead ? "Editar lead" : "Novo lead"}
      sub="Dados comerciais conectados ao pipeline."
      close={close}
    >
      <form onSubmit={submit} className="modalform">
        {[
          ["company", "Empresa", lead?.company],
          ["contact", "Responsável", lead?.contact],
          ["email", "E-mail", lead?.email],
          ["segment", "Segmento", lead?.segment],
          ["value", "Valor estimado", lead?.value],
          ["probability", "Probabilidade (%)", lead?.probability],
          ["next", "Próxima ação", lead?.next],
          ["date", "Próximo contato", lead?.date],
        ].map(([n, l, v]) => (
          <label key={String(n)}>
            {l}
            <input name={String(n)} required defaultValue={v ?? ""} />
          </label>
        ))}
        <label>
          Origem
          <select name="source" defaultValue={lead?.source}>
            {["Google Maps", "Instagram", "Indicação", "WhatsApp", "Prospecção", "Outros"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={lead?.status}>
            {stages.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Responsável
          <select name="owner" defaultValue={lead?.owner}>
            <option>Rafael Lima</option>
            <option>Bianca Alves</option>
          </select>
        </label>
        <footer>
          <Btn plain onClick={close}>
            Cancelar
          </Btn>
          <Btn submit>Salvar lead</Btn>
        </footer>
      </form>
    </Modal>
  );
}
function ProjectForm({
  clients,
  close,
  save,
}: {
  clients: Client[];
  close: () => void;
  save: (name: string, clientId: string, value: string) => void;
}) {
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [value, setValue] = useState("");
  return (
    <Modal title="Novo projeto" sub="Todo projeto pertence a um cliente." close={close}>
      <form
        className="modalform"
        onSubmit={(e) => {
          e.preventDefault();
          save(name, clientId, value);
        }}
      >
        {clients.length === 0 && (
          <div className="login-error wide">
            Ainda não há clientes. Marque um lead como "Ganho" para criar o primeiro cliente.
          </div>
        )}
        <label>
          Nome do projeto
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Cliente
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor (R$)
          <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
        </label>
        <footer>
          <Btn plain onClick={close}>
            Cancelar
          </Btn>
          <Btn submit disabled={clients.length === 0}>
            Criar projeto
          </Btn>
        </footer>
      </form>
    </Modal>
  );
}
function QuickForm({
  type,
  close,
  save,
}: {
  type: "task" | "expense" | "revenue";
  close: () => void;
  save: (a: string, b: string) => void;
}) {
  const [a, setA] = useState(""),
    [b, setB] = useState("");
  return (
    <Modal
      title={type === "task" ? "Nova tarefa" : type === "revenue" ? "Nova receita" : "Nova despesa"}
      sub="O registro ficará integrado à operação."
      close={close}
    >
      <form
        className="modalform"
        onSubmit={(e) => {
          e.preventDefault();
          save(a, b);
        }}
      >
        <label>
          {type === "task" ? "Título" : "Descrição"}
          <input value={a} onChange={(e) => setA(e.target.value)} required />
        </label>
        <label>
          {type === "task" ? "Vínculo" : "Valor (R$)"}
          <input value={b} onChange={(e) => setB(e.target.value)} required />
        </label>
        <footer>
          <Btn plain onClick={close}>
            Cancelar
          </Btn>
          <Btn submit>{type === "task" ? "Criar tarefa" : type === "revenue" ? "Registrar receita" : "Registrar despesa"}</Btn>
        </footer>
      </form>
    </Modal>
  );
}
