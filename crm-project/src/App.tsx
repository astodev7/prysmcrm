import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
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
  Activity,
  FileText,
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
  | "Acompanhamento"
  | "Propostas"
  | "Configurações";

function exportCsv(filename: string, rows: (string | number)[][]) {
  const csv = "\uFEFF" + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

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
  ["Acompanhamento", Activity],
  ["Propostas", FileText],
  ["Clientes", UsersRound],
  ["Projetos", BriefcaseBusiness],
  ["Tarefas", ListTodo],
  ["Financeiro", WalletCards],
  ["Despesas", ReceiptText],
  ["Relatórios", FileBarChart],
  ["Configurações", Settings],
];

function LoginPage({ onLogin }: { onLogin: (user: AuthUser, token?: string) => void | Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(email, password, otp || undefined);
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
            <small>CRM</small>
          </span>
        </div>
        <h1>Entrar no CRM</h1>
        <p>Use o e-mail e a senha da sua conta.</p>
        {error && <div className="login-error">{error}</div>}
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label>
          Senha
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <label>
          Código do autenticador <span className="field-hint">se ativado na sua conta</span>
          <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" aria-label="Código de seis dígitos do aplicativo autenticador" />
        </label>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}

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
  const [followUps, setFollowUps] = useState<import("./lib/api").ApiFollowUp[]>([]);
  const [proposals, setProposals] = useState<import("./lib/api").ApiProposal[]>([]);
  const [modal, setModal] = useState<"lead" | "task" | "expense" | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [remove, setRemove] = useState<Lead | null>(null);
  const [historyLead, setHistoryLead] = useState<Lead | null>(null);
  const [toast, setToast] = useState("");
  const [deletingLead, setDeletingLead] = useState(false);
  const writeLocks = useRef(new Set<string>());

  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 2400);
  };

  const handleLogout = () => {
    void api.logout().catch(() => undefined);
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
      const role = user?.role;
      const canSales = role === "ADMIN" || role === "COMERCIAL";
      const canOperations = role === "ADMIN" || role === "OPERACIONAL";
      const canFinance = role === "ADMIN" || role === "FINANCEIRO";
      const [leadsRes, clientsRes, projectsRes, tasksRes, financeRes] = await Promise.all([
        canSales ? api.getLeads() : Promise.resolve([]),
        canSales || canOperations ? api.getClients() : Promise.resolve([]),
        canOperations ? api.getProjects() : Promise.resolve([]),
        canSales || canOperations ? api.getTasks() : Promise.resolve([]),
        canFinance ? api.getFinance() : Promise.resolve([]),
      ]);
      setLeads(leadsRes.map(mapLead));
      setClients(clientsRes.map(mapClient));
      setProjects(projectsRes.map(mapProject));
      setTasks(tasksRes.map(mapTask));
      setMoney(financeRes.map(mapFinance));
      if (canSales) {
        const [followUpRows, proposalRows] = await Promise.all([api.getFollowUps(), api.getProposals()]);
        setFollowUps(followUpRows); setProposals(proposalRows);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao carregar dados");
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  const handleLogin = async (u: AuthUser, token?: string) => {
    setToken(token ?? null);
    setStoredUser(u);
    setUser(u);
  };

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
    try {
      const updated = await api.updateLead(id, mapLeadToApi({ status }));
      setLeads((v) => v.map((x) => (x.id === id ? mapLead(updated) : x)));
      if (status === "Ganho") {
        await loadData();
        notify("Cliente criado a partir do lead ganho");
      } else notify(`Movido para ${status}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao atualizar lead");
    }
  };

  const saveLead = async (x: Lead): Promise<boolean> => {
    if (writeLocks.current.has("lead")) return false;
    writeLocks.current.add("lead");
    try {
      if (x.id && leads.some((y) => y.id === x.id)) {
        const updated = await api.updateLead(x.id, mapLeadToApi(x));
        setLeads((v) => v.map((y) => (y.id === x.id ? mapLead(updated) : y)));
      } else {
        const created = await api.createLead(mapLeadToApi(x));
        setLeads((v) => [mapLead(created), ...v]);
      }
      setModal(null);
      notify("Lead salvo com sucesso");
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao salvar lead");
      return false;
    } finally {
      writeLocks.current.delete("lead");
    }
  };

  const deleteLead = async (lead: Lead) => {
    if (writeLocks.current.has("delete:" + lead.id)) return;
    writeLocks.current.add("delete:" + lead.id);
    setDeletingLead(true);
    try {
      await api.deleteLead(lead.id);
      setLeads((v) => v.filter((x) => x.id !== lead.id));
      setRemove(null);
      notify("Lead excluído");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao excluir lead");
    } finally {
      writeLocks.current.delete("delete:" + lead.id);
      setDeletingLead(false);
    }
  };

  const createTask = async (title: string, relation: string): Promise<boolean> => {
    if (writeLocks.current.has("task")) return false;
    writeLocks.current.add("task");
    try {
      const created = await api.createTask({ title, relation });
      setTasks((v) => [mapTask(created), ...v]);
      setModal(null);
      notify("Tarefa criada");
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao criar tarefa");
      return false;
    } finally {
      writeLocks.current.delete("task");
    }
  };

  const toggleTask = async (task: Task) => {
    const nextStatus = task.status === "Concluída" ? "Pendente" : "Concluída";
    try {
      const updated = await api.updateTask(task.id, { status: mapTaskStatusToApi(nextStatus) });
      setTasks((v) => v.map((t) => (t.id === task.id ? mapTask(updated) : t)));
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao atualizar tarefa");
    }
  };

  const createExpense = async (name: string, value: string): Promise<boolean> => {
    if (writeLocks.current.has("expense")) return false;
    writeLocks.current.add("expense");
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
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao registrar despesa");
      return false;
    } finally {
      writeLocks.current.delete("expense");
    }
  };

  const changeFinanceStatus = async (item: Money, status: string) => {
    const codes: Record<string, string> = { Pendente: "PENDENTE", Pago: "PAGO", Atrasado: "ATRASADO", Cancelado: "CANCELADO" };
    try {
      const updated = await api.updateFinance(item.id, { status: codes[status] });
      setMoney((items) => items.map((x) => x.id === item.id ? mapFinance(updated) : x));
      notify("Status financeiro atualizado");
    } catch (e) { notify(e instanceof Error ? e.message : "Não foi possível atualizar o status"); }
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
        <div className="login-card"><p>Carregando...</p></div>
      </div>
    );
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;

  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="shell">
      {menu && <button className="shade" onClick={() => setMenu(false)} />}
      <aside className={menu ? "open" : ""}>
        <div className="brand">
          <b>P</b>
          <span>
            <strong>PRYSM</strong>
            <small>CRM</small>
          </span>
        </div>
        <label>OPERAÇÃO</label>
        <nav>
          {nav.filter(([n]) => { const allowed: Record<string, string[]> = { Leads: ["ADMIN", "COMERCIAL"], Pipeline: ["ADMIN", "COMERCIAL"], Clientes: ["ADMIN", "COMERCIAL", "OPERACIONAL"], Projetos: ["ADMIN", "OPERACIONAL"], Tarefas: ["ADMIN", "COMERCIAL", "OPERACIONAL"], Financeiro: ["ADMIN", "FINANCEIRO"], Despesas: ["ADMIN", "FINANCEIRO"], Configurações: ["ADMIN", "COMERCIAL", "FINANCEIRO", "OPERACIONAL"] }; return (allowed[n] ?? ["ADMIN"]).includes(user.role); }).slice(0, 6).map(([n, I]) => (
            <button key={n} className={page === n ? "active" : ""} onClick={() => { setPage(n); setMenu(false); }}>
              <I size={18} />
              {n}
              {n === "Tarefas" && tasks.filter((t) => t.status !== "Concluída").length > 0 && (
                <em>{tasks.filter((t) => t.status !== "Concluída").length}</em>
              )}
            </button>
          ))}
          <div className="nav-split" />
          {nav.filter(([n]) => { const allowed: Record<string, string[]> = { Leads: ["ADMIN", "COMERCIAL"], Pipeline: ["ADMIN", "COMERCIAL"], Clientes: ["ADMIN", "COMERCIAL", "OPERACIONAL"], Projetos: ["ADMIN", "OPERACIONAL"], Tarefas: ["ADMIN", "COMERCIAL", "OPERACIONAL"], Financeiro: ["ADMIN", "FINANCEIRO"], Despesas: ["ADMIN", "FINANCEIRO"], Configurações: ["ADMIN", "COMERCIAL", "FINANCEIRO", "OPERACIONAL"] }; return (allowed[n] ?? ["ADMIN"]).includes(user.role); }).slice(6).map(([n, I]) => (
            <button key={n} className={page === n ? "active" : ""} onClick={() => { setPage(n); setMenu(false); }}>
              <I size={18} />
              {n}
            </button>
          ))}
        </nav>
        <div className="goal">
          <span>Sessão <b>{user.role}</b></span>
          <small>{user.email}</small>
        </div>
      </aside>
      <main>
        <header>
          <button className="icon mobile" onClick={() => setMenu(true)}><Menu size={18} /></button>
          <div className="search">
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar leads, clientes, projetos..." />
            {search.length > 1 && (
              <div className="results">
                {result.map(([a, b]) => (
                  <button key={a} onClick={() => { setPage(b === "Lead" ? "Leads" : "Projetos"); setSearch(""); }}>
                    <strong>{a}</strong>
                    <small>{b}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="demo">{loading ? "Sincronizando..." : "API conectada"}</span>
          <button className="icon" title="Atualizar" onClick={() => loadData()}><Bell size={17} /></button>
          <div className="user">
            <b>{initials}</b>
            <span>{user.name}<small>{user.role}</small></span>
            <button className="icon" title="Sair" onClick={handleLogout}><LogOut size={14} /></button>
          </div>
        </header>
        <section className="content">
          {page === "Dashboard" && <Dashboard leads={leads} money={money} tasks={tasks} projects={projects} go={setPage} userName={user.name.split(" ")[0]} />}
          {page === "Leads" && (
            <Leads leads={leads} move={move} edit={(x) => { setEditing(x); setModal("lead"); }} add={() => { setEditing(null); setModal("lead"); }} remove={setRemove} history={setHistoryLead} />
          )}
          {page === "Pipeline" && <Pipeline leads={leads} move={move} add={() => setModal("lead")} />}
          {page === "Acompanhamento" && <FollowUpCenter leads={leads} rows={followUps} refresh={loadData} notify={notify} />}
          {page === "Propostas" && <ProposalCenter leads={leads} rows={proposals} refresh={loadData} notify={notify} />}
          {page === "Clientes" && <Clients clients={clients} projects={projects} />}
          {page === "Projetos" && <Projects projects={projects} clients={clients} />}
          {page === "Tarefas" && <Tasks tasks={tasks} onToggle={toggleTask} add={() => setModal("task")} />}
          {page === "Financeiro" && <Finance money={money} clients={clients} onStatus={changeFinanceStatus} />}
          {page === "Despesas" && <Expenses money={money} add={() => setModal("expense")} onStatus={changeFinanceStatus} />}
          {page === "Relatórios" && <Reports leads={leads} money={money} />}
          {page === "Configurações" && <SettingsPage notify={notify} user={user} logout={handleLogout} />}
        </section>
      </main>
      {modal === "lead" && <LeadForm lead={editing} close={() => setModal(null)} save={saveLead} />}
      {modal === "task" && <QuickForm type="task" close={() => setModal(null)} save={createTask} />}
      {modal === "expense" && <QuickForm type="expense" close={() => setModal(null)} save={createExpense} />}
      {historyLead && <ActivityTimeline lead={historyLead} close={() => setHistoryLead(null)} notify={notify} />}
      {remove && (
        <Modal title="Excluir lead?" sub={`Esta ação removerá ${remove.company} do CRM.`} close={() => setRemove(null)}>
          <div className="confirm">
            <Trash2 />
            <p>Esta operação não poderá ser desfeita.</p>
            <button onClick={() => setRemove(null)}>Cancelar</button>
            <button className="danger" onClick={() => deleteLead(remove)} disabled={deletingLead}>{deletingLead ? "Excluindo…" : "Excluir definitivamente"}</button>
          </div>
        </Modal>
      )}
      {toast && <div className="toast"><Check size={14} />{toast}</div>}
    </div>
  );
}

function Head({ k = "VISÃO GERAL", title, sub, children }: { k?: string; title: string; sub: string; children?: React.ReactNode }) {
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
function Btn({ children, onClick, plain = false, type = "button", disabled = false }: { children: React.ReactNode; onClick?: () => void; plain?: boolean; type?: "button" | "submit"; disabled?: boolean }) {
  return <button className={`btn ${plain ? "plain" : ""}`} onClick={onClick} type={type} disabled={disabled}>{children}</button>;
}
function Badge({ s }: { s: string }) {
  return (
    <span className={`badge ${s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", "-")}`}>
      <i />{s}
    </span>
  );
}
function Metric({ name, value, Icon }: { name: string; value: string; Icon: typeof Target }) {
  return (
    <article className="metric">
      <span>{name}<i><Icon size={16} /></i></span>
      <strong>{value}</strong>
    </article>
  );
}
function PanelHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="panelhead">
      <div><h2>{title}</h2><p>{sub}</p></div>
    </div>
  );
}
function Dashboard({ leads, money, tasks, projects, go, userName }: { leads: Lead[]; money: Money[]; tasks: Task[]; projects: Project[]; go: (p: Page) => void; userName: string }) {
  const [period, setPeriod] = useState<"30 dias" | "Todo período">("30 dias");
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const periodLeads = period === "30 dias" ? leads.filter((x) => !x.createdAt || new Date(x.createdAt).getTime() >= cutoff) : leads;
  const periodMoney = period === "30 dias" ? money.filter((x) => {
    const effectiveDate = x.status === "Pago" ? x.paidAt : x.dueDate || x.createdAt;
    return !effectiveDate || new Date(effectiveDate).getTime() >= cutoff;
  }) : money;
  const rec = periodMoney.filter((x) => x.kind === "receita" && x.status === "Pago").reduce((s, x) => s + x.value, 0);
  const exp = periodMoney.filter((x) => x.kind === "despesa" && x.status === "Pago").reduce((s, x) => s + x.value, 0);
  const receivable = periodMoney.filter((x) => x.kind === "receita" && ["Pendente", "Atrasada"].includes(x.status)).reduce((s, x) => s + x.value, 0);
  const pendingExpense = periodMoney.filter((x) => x.kind === "despesa" && ["Pendente", "Atrasada"].includes(x.status)).reduce((s, x) => s + x.value, 0);
  const pipe = periodLeads.filter((x) => !["Ganho", "Perdido"].includes(x.status)).reduce((s, x) => s + x.value, 0);
  const won = periodLeads.filter((x) => x.status === "Ganho");
  const sales = won.reduce((s, x) => s + x.value, 0);
  const conv = periodLeads.length ? Math.round((won.length / periodLeads.length) * 100) : 0;
  return (
    <>
      <Head title={`Bom dia, ${userName}`} sub="Aqui está o pulso da sua operação hoje.">
        <Btn plain onClick={() => setPeriod(period === "30 dias" ? "Todo período" : "30 dias")}><CalendarDays size={15} /> {period}</Btn>
        <Btn plain onClick={() => exportCsv("leads.csv", [["Empresa", "Contato", "E-mail", "Telefone", "Status", "Valor", "Responsável"], ...leads.map((x) => [x.company, x.contact, x.email, x.phone, x.status, x.value, x.owner])])}><Download size={15} /> Exportar leads</Btn>
      </Head>
      <div className="metrics">
        <Metric name="Pipeline ativo" value={brl(pipe)} Icon={Target} />
        <Metric name="Vendas fechadas" value={brl(sales)} Icon={BriefcaseBusiness} />
        <Metric name="Receita recebida" value={brl(rec)} Icon={CircleDollarSign} />
        <Metric name="Lucro realizado" value={brl(rec - exp)} Icon={TrendingUp} />
        <Metric name="Taxa de conversão" value={`${conv}%`} Icon={BarChart3} />
      </div>
      <div className="strip"><span>A receber<b>{brl(receivable)}</b></span><span>Despesas pagas<b>{brl(exp)}</b></span><span>Despesas pendentes<b>{brl(pendingExpense)}</b></span><span>Ticket médio<b>{brl(won.length ? sales / won.length : 0)}</b></span></div>
      <div className="dash">
        <article className="panel chart">
          <PanelHead title="Desempenho financeiro" sub="Pagamentos confirmados no período" />
          <div className="chartnums">
            <span>Receita <b>{brl(rec)}</b></span>
            <span>Despesas <b>{brl(exp)}</b></span>
            <span>Lucro <b>{brl(rec - exp)}</b></span>
          </div>
          {rec + exp === 0 && <p className="note">Ainda não há pagamentos confirmados neste período para formar uma série histórica.</p>}
        </article>
        <article className="panel funnel">
          <PanelHead title="Funil de vendas" sub={`${periodLeads.length} oportunidades no período`} />
          {["Novo", "Interessado", "Proposta enviada", "Em negociação", "Ganho"].map((s, i) => (
            <div key={s}>
              <span>{s}<b>{i === 0 ? periodLeads.length : periodLeads.filter((x) => x.status === s).length}</b></span>
              <i><b style={{ width: `${periodLeads.length ? periodLeads.filter((x) => x.status === s).length / periodLeads.length * 100 : 0}%` }} /></i>
            </div>
          ))}
        </article>
      </div>
      <div className="twocol">
        <article className="panel">
          <PanelHead title="Próximas ações" sub="Itens que precisam da sua atenção" />
          <div className="rows">
            {tasks.slice(0, 5).map((x) => (
              <div key={x.id}>
                <Clock />
                <span><strong>{x.title}</strong><small>{x.relation} · {x.due}</small></span>
                <Badge s={x.status} />
              </div>
            ))}
            {tasks.length === 0 && <p className="note">Nenhuma tarefa pendente.</p>}
          </div>
        </article>
        <article className="panel">
          <PanelHead title="Projetos em andamento" sub={`${projects.length} projetos`} />
          <div className="projbox">
            {projects.slice(0, 5).map((x) => (
              <div className="projline" key={x.id}>
                <span><strong>{x.name}</strong><small>{x.status} · {x.progress}%</small></span>
                <b>{brl(x.value)}</b>
              </div>
            ))}
            {projects.length === 0 && <div className="empty-state"><BriefcaseBusiness size={25} /><strong>Nenhum projeto por aqui</strong><span>Assim que houver um projeto vinculado a um cliente, ele aparecerá neste resumo.</span></div>}
          </div>
          <button type="button" className="btn plain footbtn" onClick={() => go("Projetos")}>Ver todos os projetos</button>
        </article>
      </div>
    </>
  );
}
function Clock() {
  return <i className="clock"><CalendarDays size={14} /></i>;
}
function Leads({ leads, edit, add, remove, history }: { leads: Lead[]; move: (id: string, status: Status) => void; edit: (l: Lead) => void; add: () => void; remove: (l: Lead) => void; history: (l: Lead) => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("Todos");
  const [source, setSource] = useState("");
  const filtered = leads.filter((x) => (status === "Todos" || x.status === status) && (!source || x.source === source) && (x.company + x.contact).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Head k="COMERCIAL" title="Leads" sub={`${leads.length} oportunidades registradas na base.`}>
        <Btn onClick={add}><Plus size={16} /> Novo lead</Btn>
      </Head>
      <article className="panel table">
        <div className="tools">
          <div><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa ou contato" /></div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>Todos</option>
            {stages.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filtrar por origem"><option value="">Todas as origens</option>{[...new Set(leads.map((x) => x.source).filter(Boolean))].map((item) => <option key={item}>{item}</option>)}</select>
        </div>
        <Table leads={filtered} edit={edit} remove={remove} history={history} />
      </article>
    </>
  );
}
function Table({ leads, edit, remove, history }: { leads: Lead[]; edit: (l: Lead) => void; remove: (l: Lead) => void; history: (l: Lead) => void }) {
  return (
    <div className="scroll">
      <table>
        <thead><tr><th>EMPRESA / CONTATO</th><th>STATUS</th><th>ORIGEM</th><th>RESPONSÁVEL</th><th>PRÓXIMA AÇÃO</th><th>VALOR</th><th /></tr></thead>
        <tbody>
          {leads.map((x) => (
            <tr key={x.id}>
              <td><div className="entity"><b>{x.company[0]}</b><span><strong>{x.company}</strong><small>{x.contact} · {x.segment}</small></span></div></td>
              <td><Badge s={x.status} /></td>
              <td>{x.source}</td>
              <td>{x.owner}</td>
              <td><strong>{x.next}</strong><small>{x.date}</small></td>
              <td><strong>{brl(x.value)}</strong><small>{x.probability}% prob.</small></td>
              <td>
                <button type="button" onClick={() => history(x)}>Histórico</button>
                <button type="button" onClick={() => edit(x)}>Editar</button>
                <button type="button" onClick={() => remove(x)} aria-label={"Excluir lead " + x.company} title="Excluir lead"><Trash2 size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Pipeline({ leads, move, add }: { leads: Lead[]; move: (id: string, status: Status) => void; add: () => void }) {
  const active = leads.filter((x) => !["Ganho", "Perdido"].includes(x.status));
  return (
    <>
      <Head k="COMERCIAL" title="Pipeline de vendas" sub="Arraste oportunidades entre etapas para atualizar o funil.">
        <Btn onClick={add}><Plus size={16} /> Nova oportunidade</Btn>
      </Head>
      <div className="kanban">
        {stages.map((s) => (
          <section key={s} onDragOver={(e) => e.preventDefault()} onDrop={(e) => move(e.dataTransfer.getData("id"), s)}>
            <header>
              <strong>{s}<em>{leads.filter((x) => x.status === s).length}</em></strong>
              <span>{brl(leads.filter((x) => x.status === s).reduce((a, x) => a + x.value, 0))}</span>
            </header>
            {leads.filter((x) => x.status === s).map((x) => (
              <article draggable onDragStart={(e) => e.dataTransfer.setData("id", x.id)} key={x.id}>
                <div><b>{x.company[0]}</b><span><strong>{x.company}</strong><small>{x.contact}</small></span></div>
                <footer><em>{x.owner}</em><strong>{brl(x.value)}</strong></footer>
              </article>
            ))}
          </section>
        ))}
      </div>
      <p className="note">{active.length} oportunidades ativas · {brl(active.reduce((s, x) => s + x.value, 0))}</p>
    </>
  );
}
function Clients({ clients, projects }: { clients: Client[]; projects: Project[] }) {
  return (
    <>
      <Head k="COMERCIAL" title="Clientes" sub={`${clients.length} clientes ativos.`} />
      <article className="panel table">
        <div className="scroll">
          <table>
            <thead><tr><th>EMPRESA</th><th>CONTATO</th><th>PROJETOS</th><th>VALOR</th></tr></thead>
            <tbody>
              {clients.map((x) => (
                <tr key={x.id}>
                  <td><div className="entity"><b>{x.company[0]}</b><strong>{x.company}</strong></div></td>
                  <td>{x.contact}</td>
                  <td>{projects.filter((p) => p.clientId === x.id).length}</td>
                  <td><strong>{brl(x.value)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          {clients.length === 0 && <div className="empty-state"><UsersRound size={25} /><strong>Nenhum cliente cadastrado</strong><span>Quando um lead for marcado como ganho, ele aparecerá aqui automaticamente.</span></div>}
        </div>
      </article>
    </>
  );
}
function Projects({ projects, clients }: { projects: Project[]; clients: Client[] }) {
  return (
    <>
      <Head k="OPERAÇÃO" title="Projetos" sub={`${projects.length} projetos em gestão.`} />
      <article className="panel">
        {projects.map((x) => (
          <div className="project" key={x.id}>
            <span><strong>{x.name}</strong><small>{clients.find((c) => c.id === x.clientId)?.company}</small></span>
            <Badge s={x.status} />
            <span className="grow">Progresso <b>{x.progress}%</b><i><b style={{ width: `${x.progress}%` }} /></i></span>
            <strong>{brl(x.value)}<small>Prazo {x.deadline}</small></strong>
          </div>
        ))}
        {projects.length === 0 && <div className="empty-state"><BriefcaseBusiness size={25} /><strong>Nenhum projeto cadastrado</strong><span>Os projetos vinculados aos seus clientes aparecerão nesta área.</span></div>}
      </article>
    </>
  );
}
function Tasks({ tasks, onToggle, add }: { tasks: Task[]; onToggle: (t: Task) => void; add: () => void }) {
  return (
    <>
      <Head k="ACOMPANHAMENTO" title="Tarefas" sub="Prioridades comerciais e operacionais.">
        <Btn onClick={add}><Plus size={16} /> Nova tarefa</Btn>
      </Head>
      <div className="taskboard">
        {["Atrasada", "Pendente", "Em andamento", "Concluída"].map((s) => (
          <section key={s}>
            <header>{s}<em>{tasks.filter((x) => x.status === s).length}</em></header>
            {tasks.filter((x) => x.status === s).map((x) => (
              <article key={x.id}>
                <button type="button" onClick={() => onToggle(x)}>{x.status === "Concluída" && <Check size={12} />}</button>
                <span><strong>{x.title}</strong><small>{x.relation}</small><footer><em>{x.priority}</em>{x.due}</footer></span>
              </article>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
function Finance({ money, clients, onStatus }: { money: Money[]; clients: Client[]; onStatus: (item: Money, status: string) => void }) {
  const rec = money.filter((x) => x.kind === "receita");
  const exp = money.filter((x) => x.kind === "despesa");
  const paid = rec.filter((x) => x.status === "Pago").reduce((s, x) => s + x.value, 0);
  const cost = exp.filter((x) => x.status === "Pago").reduce((s, x) => s + x.value, 0);
  return (
    <>
      <Head k="FINANCEIRO" title="Visão financeira" sub="Contrato, faturamento e caixa tratados separadamente." />
      <div className="metrics four">
        <Metric name="Total vendido" value={brl(clients.reduce((s, x) => s + x.value, 0))} Icon={BriefcaseBusiness} />
        <Metric name="Efetivamente recebido" value={brl(paid)} Icon={CircleDollarSign} />
        <Metric name="Despesas pagas" value={brl(cost)} Icon={WalletCards} />
        <Metric name="Lucro realizado" value={brl(paid - cost)} Icon={TrendingUp} />
      </div>
      <MoneyTable data={rec} onStatus={onStatus} />
    </>
  );
}
function Expenses({ money, add, onStatus }: { money: Money[]; add: () => void; onStatus: (item: Money, status: string) => void }) {
  const data = money.filter((x) => x.kind === "despesa");
  return (
    <>
      <Head k="FINANCEIRO" title="Despesas" sub="Custos operacionais e de projetos.">
        <Btn onClick={add}><Plus size={16} /> Nova despesa</Btn>
      </Head>
      <MoneyTable data={data} onStatus={onStatus} />
    </>
  );
}
function MoneyTable({ data, onStatus }: { data: Money[]; onStatus: (item: Money, status: string) => void }) {
  return (
    <article className="panel table">
      <div className="scroll">
        <table>
          <thead><tr><th>DESCRIÇÃO</th><th>VÍNCULO</th><th>STATUS</th><th>VALOR</th></tr></thead>
          <tbody>
            {data.map((x) => (
              <tr key={x.id}>
                <td><strong>{x.name}</strong></td>
                <td>{x.relation}</td>
                <td><select aria-label={`Status de ${x.name}`} value={x.status} onChange={(e) => onStatus(x, e.target.value)}>{["Pendente", "Pago", "Atrasado", "Cancelado"].map((s) => <option key={s}>{s}</option>)}</select></td>
                <td><strong>{x.kind === "despesa" ? "−" : ""}{brl(x.value)}</strong></td>
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
        <Metric name="Conversão" value={`${leads.length ? Math.round((ganho / leads.length) * 100) : 0}%`} Icon={BarChart3} />
        <Metric name="Receita paga" value={brl(rec)} Icon={CircleDollarSign} />
      </div>
    </>
  );
}

function FollowUpCenter({ leads, rows, refresh, notify }: { leads: Lead[]; rows: import("./lib/api").ApiFollowUp[]; refresh: () => Promise<void>; notify: (s: string) => void }) {
  const [leadId, setLeadId] = useState(leads[0]?.id ?? ""); const [description, setDescription] = useState(""); const [dueAt, setDueAt] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!leadId && leads[0]) setLeadId(leads[0].id); }, [leadId, leads]);
  const act = async (id: string, status: "CONCLUIDO" | "CANCELADO") => { try { await api.updateFollowUp(id, { status }); await refresh(); } catch (e) { notify(e instanceof Error ? e.message : "Falha ao atualizar acompanhamento"); } };
  const submit = async (e: FormEvent) => { e.preventDefault(); if (busy) return; setBusy(true); try { await api.createFollowUp({ leadId, description, dueAt: new Date(dueAt).toISOString() }); setDescription(""); await refresh(); notify("Acompanhamento agendado"); } catch (e) { notify(e instanceof Error ? e.message : "Falha ao agendar"); } finally { setBusy(false); } };
  const pending = rows.filter((r) => r.status === "PENDENTE"); const overdue = pending.filter((r) => new Date(r.dueAt) < new Date());
  return <><Head k="COMERCIAL" title="Central de acompanhamento" sub={`${pending.length} pendentes · ${overdue.length} atrasados`} /><article className="panel form"><h2>Agendar retorno</h2><form className="userform" onSubmit={submit}><label>Lead<select value={leadId} onChange={(e) => setLeadId(e.target.value)} required>{leads.map((l) => <option key={l.id} value={l.id}>{l.company}</option>)}</select></label><label>Descrição<input value={description} onChange={(e) => setDescription(e.target.value)} required /></label><label>Data e hora<input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required /></label><Btn type="submit" disabled={busy || leads.length === 0}>{busy ? "Salvando…" : "Agendar"}</Btn></form></article><article className="panel table"><div className="scroll"><table><thead><tr><th>DATA</th><th>LEAD</th><th>ACOMPANHAMENTO</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{new Date(r.dueAt).toLocaleString("pt-BR")}</td><td>{r.lead.company}</td><td>{r.description}</td><td>{r.status === "PENDENTE" && new Date(r.dueAt) < new Date() ? "Atrasado" : r.status}</td><td>{r.status === "PENDENTE" && <><button onClick={() => act(r.id, "CONCLUIDO")}>Concluir</button><button onClick={() => act(r.id, "CANCELADO")}>Cancelar</button></>}</td></tr>)}</tbody></table>{rows.length === 0 && <p className="note">Nenhum acompanhamento cadastrado.</p>}</div></article></>;
}

function ProposalCenter({ leads, rows, refresh, notify }: { leads: Lead[]; rows: import("./lib/api").ApiProposal[]; refresh: () => Promise<void>; notify: (s: string) => void }) {
  const [leadId, setLeadId] = useState(leads[0]?.id ?? ""); const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [value, setValue] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!leadId && leads[0]) setLeadId(leads[0].id); }, [leadId, leads]);
  const submit = async (e: FormEvent) => { e.preventDefault(); if (busy) return; setBusy(true); try { await api.createProposal(leadId, { title, description, items: [{ name: title, quantity: 1, unitPrice: Number(value) }], discount: 0 }); setTitle(""); setDescription(""); setValue(""); await refresh(); notify("Proposta criada"); } catch (e) { notify(e instanceof Error ? e.message : "Falha ao criar proposta"); } finally { setBusy(false); } };
  return <><Head k="COMERCIAL" title="Propostas comerciais" sub="Propostas versionadas e vinculadas às oportunidades." /><article className="panel form"><form className="userform" onSubmit={submit}><label>Lead<select value={leadId} onChange={(e) => setLeadId(e.target.value)} required>{leads.map((l) => <option key={l.id} value={l.id}>{l.company}</option>)}</select></label><label>Título do projeto<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label><label>Descrição<input value={description} onChange={(e) => setDescription(e.target.value)} required /></label><label>Valor contratado (R$)<input type="number" min="0.01" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} required /></label><Btn type="submit" disabled={busy || leads.length === 0}>{busy ? "Salvando…" : "Criar proposta"}</Btn></form></article><article className="panel table"><div className="scroll"><table><thead><tr><th>PROPOSTA</th><th>EMPRESA</th><th>STATUS</th><th>VERSÃO</th><th>VALOR</th></tr></thead><tbody>{rows.map((p) => <tr key={p.id}><td>{p.title}</td><td>{p.lead?.company}</td><td>{p.status}</td><td>v{p.version}</td><td>{brl(Number(p.total))}</td></tr>)}</tbody></table>{rows.length === 0 && <p className="note">Nenhuma proposta cadastrada.</p>}</div></article></>;
}

function ActivityTimeline({ lead, close, notify }: { lead: Lead; close: () => void; notify: (s: string) => void }) {
  const [rows, setRows] = useState<{ id: string; type: string; content: string; createdAt: string }[]>([]); const [type, setType] = useState("OBSERVACAO"); const [content, setContent] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.getLeadActivities(lead.id).then(setRows).catch((e) => notify(e instanceof Error ? e.message : "Falha ao carregar histórico")), [lead.id, notify]);
  useEffect(() => { void load(); }, [load]);
  const submit = async (e: FormEvent) => { e.preventDefault(); if (busy) return; setBusy(true); try { await api.createLeadActivity(lead.id, { type, content }); setContent(""); await load(); } catch (e) { notify(e instanceof Error ? e.message : "Falha ao registrar atividade"); } finally { setBusy(false); } };
  return <Modal title={`Histórico · ${lead.company}`} sub="Atividades registradas em ordem cronológica." close={close}><div className="quick"><form className="userform" onSubmit={submit}><label>Tipo<select value={type} onChange={(e) => setType(e.target.value)}><option value="OBSERVACAO">Observação</option><option value="LIGACAO">Ligação</option><option value="MENSAGEM_ENVIADA">Mensagem enviada</option><option value="MENSAGEM_RECEBIDA">Mensagem recebida</option><option value="REUNIAO">Reunião</option><option value="PROPOSTA">Proposta enviada/atualizada</option></select></label><label>Descrição<input value={content} onChange={(e) => setContent(e.target.value)} required /></label><Btn type="submit" disabled={busy}>{busy ? "Salvando…" : "Registrar"}</Btn></form><ol className="activity-timeline">{rows.map((r) => <li key={r.id}><strong>{r.type.replaceAll("_", " ")}</strong><p>{r.content}</p><small>{new Date(r.createdAt).toLocaleString("pt-BR")}</small></li>)}</ol></div></Modal>;
}

function Modal({ title, sub, close, children }: { title: string; sub: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className="backdrop">
      <section className="modal">
        <header><span><h2>{title}</h2><p>{sub}</p></span><button type="button" onClick={close}><X size={18} /></button></header>
        {children}
      </section>
    </div>
  );
}
function LeadForm({ lead, close, save }: { lead: Lead | null; close: () => void; save: (l: Lead) => Promise<boolean> }) {
  const [saving, setSaving] = useState(false);
  const submitLock = useRef(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setSaving(true);
    const d = new FormData(e.currentTarget);
    const saved = await save({
      id: lead?.id || "",
      company: String(d.get("company")),
      contact: String(d.get("contact")),
      email: String(d.get("email")),
      phone: String(d.get("phone")),
      segment: String(d.get("segment")),
      source: String(d.get("source")),
      status: String(d.get("status")) as Status,
      owner: lead?.owner || "",
      value: Number(d.get("value")),
      probability: Number(d.get("probability")),
      next: String(d.get("next")),
      date: String(d.get("date") || ""),
      createdAt: lead?.createdAt || new Date().toISOString(),
    });
    if (saved) close();
    else { submitLock.current = false; setSaving(false); }
  };
  return (
    <Modal title={lead ? "Editar lead" : "Novo lead"} sub="Dados comerciais conectados ao pipeline." close={close}>
      <form onSubmit={submit} className="modalform">
        {[ ["company", "Empresa", lead?.company], ["contact", "Responsável", lead?.contact], ["email", "E-mail", lead?.email], ["phone", "Telefone", lead?.phone], ["segment", "Segmento", lead?.segment], ["value", "Valor estimado", lead?.value ?? 0], ["probability", "Probabilidade (%)", lead?.probability ?? 0], ["next", "Próxima ação", lead?.next]].map(([n, l, v]) => (
          <label key={String(n)}>{l}<input name={String(n)} required={n === "company" || n === "contact"} type={n === "value" ? "number" : n === "probability" ? "number" : "text"} min={n === "value" || n === "probability" ? 0 : undefined} max={n === "probability" ? 100 : undefined} step={n === "value" ? "0.01" : "1"} defaultValue={v ?? ""} /></label>
        ))}
        <label>Próximo contato<input name="date" type="date" defaultValue={lead?.date || ""} /></label>
        <label>Origem
          <select name="source" defaultValue={lead?.source || "Outros"}>
            {["Google Maps", "Instagram", "Indicação", "WhatsApp", "Prospecção", "Outros"].map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label>Status
          <select name="status" defaultValue={lead?.status || "Novo"}>
            {stages.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <footer>
          <Btn plain onClick={close}>Cancelar</Btn>
          <Btn type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar lead"}</Btn>
        </footer>
      </form>
    </Modal>
  );
}
function QuickForm({ type, close, save }: { type: "task" | "expense"; close: () => void; save: (a: string, b: string) => Promise<boolean> }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [saving, setSaving] = useState(false);
  const submitLock = useRef(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setSaving(true);
    const saved = await save(a, b);
    if (saved) close();
    else { submitLock.current = false; setSaving(false); }
  };
  return (
    <Modal title={type === "task" ? "Nova tarefa" : "Nova despesa"} sub="O registro fica salvo no banco." close={close}>
      <form className="modalform" onSubmit={submit}>
        <label>{type === "task" ? "Título" : "Descrição"}<input value={a} onChange={(e) => setA(e.target.value)} required /></label>
        <label>{type === "task" ? "Vínculo" : "Valor (R$)"}<input value={b} onChange={(e) => setB(e.target.value)} required /></label>
        <footer>
          <Btn plain onClick={close}>Cancelar</Btn>
          <Btn type="submit" disabled={saving}>{saving ? "Salvando…" : type === "task" ? "Criar tarefa" : "Registrar despesa"}</Btn>
        </footer>
      </form>
    </Modal>
  );
}
function SettingsPage({ notify, user, logout }: { notify: (s: string) => void; user: AuthUser; logout: () => void }) {
  const adminTabs = ["Dados da empresa", "Usuários e permissões", "Status do pipeline", "Categorias financeiras", "Pacotes de serviços", "Notificações"] as const;
  const tabs = user.role === "ADMIN" ? [...adminTabs, "Segurança"] : ["Segurança"] as const;
  const icons: Record<string, typeof UserRound> = { "Dados da empresa": UserRound, "Usuários e permissões": UsersRound, "Status do pipeline": KanbanSquare, "Categorias financeiras": WalletCards, "Pacotes de serviços": BriefcaseBusiness, Notificações: Bell, Segurança: Settings };
  const [tab, setTab] = useState<string>(user.role === "ADMIN" ? "Dados da empresa" : "Segurança");

  return (
    <>
      <Head k="ADMINISTRAÇÃO" title="Configurações" sub="Personalize o CRM e o acesso da equipe." />
      <div className="settings">
        <nav>
          {tabs.map((s, i) => {
            const I = icons[s];
            return (
              <button
                className={tab === s ? "active" : ""}
                key={s}
                type="button"
                onClick={() => setTab(s)}
              >
                <I size={16} /> {s}
              </button>
            );
          })}
        </nav>
        <article className="panel form">
          {tab === "Dados da empresa" && <CompanyForm notify={notify} />}
          {tab === "Usuários e permissões" && <UsersPanel notify={notify} />}
          {tab === "Status do pipeline" && <PipelineSettings />}
          {tab === "Categorias financeiras" && (
            <ListSettings
              title="Categorias financeiras"
              sub="Usadas ao lançar receitas e despesas."
              storageKey="prysm_categories"
              seed={["Projetos", "Ferramentas", "Infraestrutura", "Marketing", "Operacional"]}
            />
          )}
          {tab === "Pacotes de serviços" && (
            <ListSettings
              title="Pacotes de serviços"
              sub="Ofertas padrão para propostas."
              storageKey="prysm_packages"
              seed={["Site institucional", "Landing page", "Loja virtual", "Identidade visual"]}
            />
          )}
          {tab === "Notificações" && <NotifySettings />}
          {tab === "Segurança" && <><PasswordPanel notify={notify} logout={logout} /><AuthenticatorPanel notify={notify} logout={logout} /></>}
        </article>
      </div>
    </>
  );
}


function PasswordPanel({ notify, logout }: { notify: (s: string) => void; logout: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { notify("As novas senhas não coincidem"); return; }
    setSaving(true);
    try { await api.changePassword(current, next); notify("Senha alterada. Entre novamente."); logout(); }
    catch (err) { notify(err instanceof Error ? err.message : "Não foi possível alterar a senha"); }
    finally { setSaving(false); }
  };
  return <form className="userform" onSubmit={submit}><h2>Senha e sessão</h2><p>Use pelo menos 12 caracteres com maiúscula, minúscula, número e símbolo.</p>
    <label>Senha atual<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
    <label>Nova senha<input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={12} required /></label>
    <label>Confirme a nova senha<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={12} required /></label>
    <Btn type="submit">{saving ? "Salvando..." : "Alterar senha"}</Btn>
  </form>;
}


function AuthenticatorPanel({ notify, logout }: { notify: (s: string) => void; logout: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api.totpStatus().then((result) => { if (active) setEnabled(result.enabled); })
      .catch((err) => { if (active) notify(err instanceof Error ? err.message : "Não foi possível consultar o autenticador"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [notify]);
  const begin = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { const result = await api.setupTotp(password); setSecret(result.secret); setCode(""); notify("Chave de configuração criada"); }
    catch (err) { notify(err instanceof Error ? err.message : "Não foi possível iniciar a configuração"); }
    finally { setBusy(false); }
  };
  const activate = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api.verifyTotp(code); setEnabled(true); setSecret(""); setCode(""); setPassword(""); notify("Autenticador ativado para sua conta"); }
    catch (err) { notify(err instanceof Error ? err.message : "Código inválido"); }
    finally { setBusy(false); }
  };
  const disable = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api.disableTotp(password, code); notify("Autenticador desativado. Entre novamente."); logout(); }
    catch (err) { notify(err instanceof Error ? err.message : "Não foi possível desativar o autenticador"); }
    finally { setBusy(false); }
  };
  return <section className="authenticator-panel"><h2>Aplicativo autenticador</h2>
    <p>{loading ? "Verificando configuração…" : enabled ? "Ativo: sua conta pede um código temporário a cada login." : "Adicione uma segunda etapa de verificação usando um app compatível com TOTP."}</p>
    {!loading && enabled && <form className="userform" onSubmit={disable}>
      <label>Senha atual<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <label>Código atual do autenticador<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required /></label>
      <Btn type="submit" disabled={busy}>{busy ? "Aguarde…" : "Desativar autenticador"}</Btn>
    </form>}
    {!loading && !enabled && !secret && <form className="userform" onSubmit={begin}>
      <label>Confirme sua senha<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <Btn type="submit" disabled={busy}>{busy ? "Preparando…" : "Configurar autenticador"}</Btn>
    </form>}
    {!loading && !enabled && secret && <form className="userform" onSubmit={activate}>
      <p>Abra Google Authenticator, Microsoft Authenticator, 1Password ou outro app TOTP. Adicione uma conta manualmente, escolha código baseado em tempo e informe esta chave:</p>
      <code className="totp-secret">{secret}</code>
      <label>Código de seis dígitos gerado pelo app<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" required /></label>
      <Btn type="submit" disabled={busy}>{busy ? "Verificando…" : "Confirmar e ativar"}</Btn>
    </form>}
  </section>;
}

function CompanyForm({ notify }: { notify: (s: string) => void }) {
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
        </>
      )}
    </>
  );
}

const roleLabel: Record<string, string> = {
  ADMIN: "Administrador",
  COMERCIAL: "Comercial",
  FINANCEIRO: "Financeiro",
  OPERACIONAL: "Operacional",
};

function UsersPanel({ notify }: { notify: (s: string) => void }) {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("COMERCIAL");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .getUsers()
      .then(setUsers)
      .catch((err) => notify(err instanceof Error ? err.message : "Sem permissão para ver usuários"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createUser({ name, email, password, role });
      setName("");
      setEmail("");
      setPassword("");
      notify("Usuário criado");
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao criar usuário");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2>Usuários e permissões</h2>
      <p>Contas reais da equipe. Só administradores podem criar.</p>
      {loading ? (
        <p>Carregando...</p>
      ) : (
        <ul className="userlist">
          {users.map((u) => (
            <li key={u.id}>
              <strong>{u.name}</strong>
              <small>{u.email}</small>
              <em>{roleLabel[u.role] || u.role}</em>
            </li>
          ))}
          {users.length === 0 && <li>Nenhum usuário visível.</li>}
        </ul>
      )}
      <form className="userform" onSubmit={create}>
        <h3>Novo usuário</h3>
        <label>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <label>
          Permissão
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="ADMIN">Administrador</option>
            <option value="COMERCIAL">Comercial</option>
            <option value="FINANCEIRO">Financeiro</option>
            <option value="OPERACIONAL">Operacional</option>
          </select>
        </label>
        <Btn type="submit">{saving ? "Salvando..." : "Criar usuário"}</Btn>
      </form>
    </>
  );
}

function PipelineSettings() {
  return (
    <>
      <h2>Status do pipeline</h2>
      <p>Etapas usadas no funil. Elas fazem parte do fluxo comercial do Prysm.</p>
      <ol className="stagelist">
        {stages.map((s, i) => (
          <li key={s}>
            <b>{i + 1}</b>
            {s}
          </li>
        ))}
      </ol>
    </>
  );
}

function ListSettings({
  title,
  sub,
  storageKey,
  seed,
}: {
  title: string;
  sub: string;
  storageKey: string;
  seed: string[];
}) {
  const [items, setItems] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as string[]) : seed;
    } catch {
      return seed;
    }
  });
  const [value, setValue] = useState("");

  const persist = (next: string[]) => {
    setItems(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  return (
    <>
      <h2>{title}</h2>
      <p>{sub}</p>
      <ul className="userlist">
        {items.map((item) => (
          <li key={item}>
            <strong>{item}</strong>
            <button
              type="button"
              onClick={() => persist(items.filter((x) => x !== item))}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
      <form
        className="userform"
        onSubmit={(e) => {
          e.preventDefault();
          const next = value.trim();
          if (!next || items.includes(next)) return;
          persist([...items, next]);
          setValue("");
        }}
      >
        <label>
          Adicionar
          <input value={value} onChange={(e) => setValue(e.target.value)} required />
        </label>
        <Btn type="submit">Salvar item</Btn>
      </form>
    </>
  );
}

function NotifySettings() {
  const key = "prysm_notifications";
  const [flags, setFlags] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      /* ignore */
    }
    return { tarefas: true, leads: true, financeiro: false };
  });

  const toggle = (name: string) => {
    const next = { ...flags, [name]: !flags[name] };
    setFlags(next);
    localStorage.setItem(key, JSON.stringify(next));
  };

  const rows: [string, string][] = [
    ["tarefas", "Tarefas atrasadas"],
    ["leads", "Leads sem follow-up"],
    ["financeiro", "Lançamentos vencendo"],
  ];

  return (
    <>
      <h2>Notificações</h2>
      <p>Escolha o que aparece como alerta para a sua conta neste navegador.</p>
      <ul className="userlist">
        {rows.map(([id, label]) => (
          <li key={id}>
            <strong>{label}</strong>
            <button type="button" onClick={() => toggle(id)}>
              {flags[id] ? "Ativada" : "Desligada"}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
