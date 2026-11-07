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
  Filter,
  KanbanSquare,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
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
  const [email, setEmail] = useState("rafael@nodulo.studio");
  const [password, setPassword] = useState("123456");
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
          <b>N</b>
          <span>
            <strong>NÓDULO</strong>
            <small>gestão comercial</small>
          </span>
        </div>
        <h1>Entrar no CRM</h1>
        <p>Use as credenciais do ambiente conectado ao backend.</p>
        {error && <div className="login-error">{error}</div>}
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
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
        <small className="login-hint">
          Demo: rafael@nodulo.studio / 123456
        </small>
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
  const [modal, setModal] = useState<"lead" | "task" | "expense" | null>(null);
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
          <b>N</b>
          <span>
            <strong>NÓDULO</strong>
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
              <I size={17} />
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
            <Menu size={18} />
          </button>
          <div className="search">
            <Search size={16} />
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
          <span className="demo">{loading ? "● Sincronizando..." : "● API conectada"}</span>
          <button className="icon" title="Atualizar dados" onClick={() => loadData()}>
            <Bell size={17} />
          </button>
          <div className="user">
            <b>{initials}</b>
            <span>
              {user.name}
              <small>{user.role}</small>
            </span>
            <button className="icon" title="Sair" onClick={handleLogout} style={{ marginLeft: 4 }}>
              <LogOut size={14} />
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
          {page === "Projetos" && <Projects projects={projects} clients={clients} />}
          {page === "Tarefas" && (
            <Tasks tasks={tasks} onToggle={toggleTask} add={() => setModal("task")} />
          )}
          {page === "Financeiro" && <Finance money={money} clients={clients} />}
          {page === "Despesas" && <Expenses money={money} add={() => setModal("expense")} />}
          {page === "Relatórios" && <Reports leads={leads} money={money} />}
          {page === "Configurações" && <SettingsPage notify={notify} />}
        </section>
      </main>
      {modal === "lead" && (
        <LeadForm lead={editing} close={() => setModal(null)} save={saveLead} />
      )}
      {modal === "task" && (
        <QuickForm type="task" close={() => setModal(null)} save={createTask} />
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
          <Check size={14} />
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
}: {
  children: React.ReactNode;
  onClick?: () => void;
  plain?: boolean;
}) {
  return (
    <button className={`btn ${plain ? "plain" : ""}`} onClick={onClick} type="button">
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
          <Icon size={16} />
        </i>
      </span>
      <strong>{value}</strong>
      <small>
        ↗ dados da API <em>em tempo real</em>
      </small>
    </article>
  );
}
function PanelHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="panelhead">
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
      <button type="button">Ver detalhes ›</button>
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
        <Btn plain>
          <CalendarDays size={15} /> Últimos 30 dias
        </Btn>
        <Btn plain>
          <Download size={15} /> Exportar
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
          <PanelHead title="Desempenho financeiro" sub="Receitas, despesas e lucro realizado" />
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
          <PanelHead title="Funil de vendas" sub={`${leads.length} oportunidades no período`} />
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
          <PanelHead title="Próximas ações" sub="Itens que precisam da sua atenção" />
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
          <PanelHead title="Projetos em andamento" sub={`${projects.length} projetos`} />
          <div className="rows">
            {projects.slice(0, 5).map((x) => (
              <div key={x.id}>
                <span>
                  <strong>{x.name}</strong>
                  <small>
                    {x.status} · {x.progress}%
                  </small>
                </span>
                <strong>{brl(x.value)}</strong>
              </div>
            ))}
            {projects.length === 0 && <p className="note">Nenhum projeto ainda.</p>}
          </div>
          <button type="button" className="btn plain" onClick={() => go("Projetos")}>
            Ver todos os projetos
          </button>
        </article>
      </div>
    </>
  );
}
function Clock() {
  return (
    <i className="clock">
      <CalendarDays size={14} />
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
    const rows = [
      ["Empresa", "Contato", "Status", "Valor", "Probabilidade"],
      ...filtered.map((x) => [x.company, x.contact, x.status, String(x.value), String(x.probability)]),
    ];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "leads.csv";
    a.click();
  };
  return (
    <>
      <Head k="COMERCIAL" title="Leads" sub={`${leads.length} oportunidades registradas na base.`}>
        <Btn plain onClick={csv}>
          <Download size={15} /> Exportar
        </Btn>
        <Btn onClick={add}>
          <Plus size={16} /> Novo lead
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
            <Search size={15} />
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
          <button type="button">
            <Filter size={14} /> Mais filtros
          </button>
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
                  <Trash2 size={14} />
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
          <Plus size={16} /> Nova oportunidade
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
        <Btn plain>
          <Download size={15} /> Exportar
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
function Projects({ projects, clients }: { projects: Project[]; clients: Client[] }) {
  return (
    <>
      <Head k="OPERAÇÃO" title="Projetos" sub={`${projects.length} projetos em gestão.`}>
        <Btn plain>
          <Plus size={16} /> Novo projeto
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
          <Plus size={16} /> Nova tarefa
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
                    {x.status === "Concluída" && <Check size={12} />}
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
function Finance({ money, clients }: { money: Money[]; clients: Client[] }) {
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
        <Btn>
          <Plus size={16} /> Nova receita
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
          <Plus size={16} /> Nova despesa
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

function SettingsPage({ notify }: { notify: (s: string) => void }) {
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
    <>
      <Head k="ADMINISTRAÇÃO" title="Configurações" sub="Personalize o CRM e o acesso da equipe." />
      <div className="settings">
        <nav>
          {[
            ["Dados da empresa", UserRound],
            ["Usuários e permissões", UsersRound],
            ["Status do pipeline", KanbanSquare],
            ["Categorias financeiras", WalletCards],
            ["Pacotes de serviços", BriefcaseBusiness],
            ["Notificações", Bell],
          ].map(([s, I], i) => (
            <button className={i === 0 ? "active" : ""} key={s as string} type="button">
              {<I size={16} />} {s as string}
            </button>
          ))}
        </nav>
        <article className="panel form">
          <h2>Dados da empresa</h2>
          <p>Informações usadas em propostas e relatórios.</p>
          {loading ? (
            <p>Carregando...</p>
          ) : (
            <>
              <label>
                Nome da empresa
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div>
                <label>
                  CNPJ
                  <input
                    placeholder="00.000.000/0001-00"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                  />
                </label>
                <label>
                  E-mail
                  <input value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
              </div>
              <label>
                Endereço
                <input value={address} onChange={(e) => setAddress(e.target.value)} />
              </label>
              <Btn onClick={save}>{saving ? "Salvando..." : "Salvar alterações"}</Btn>
              <aside>
                <strong>Banco de dados conectado</strong>
                <small>Autenticação, RBAC e persistência ativos via API.</small>
              </aside>
            </>
          )}
        </article>
      </div>
    </>
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
            <X size={18} />
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
          <Btn>Salvar lead</Btn>
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
  type: "task" | "expense";
  close: () => void;
  save: (a: string, b: string) => void;
}) {
  const [a, setA] = useState(""),
    [b, setB] = useState("");
  return (
    <Modal
      title={type === "task" ? "Nova tarefa" : "Nova despesa"}
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
          <Btn>{type === "task" ? "Criar tarefa" : "Registrar despesa"}</Btn>
        </footer>
      </form>
    </Modal>
  );
}
