"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Handle,
  Position,
  useReactFlow,
  ConnectionLineType,
  type NodeProps,
  type Node,
  type Edge,
  type OnConnect,
  type NodeChange,
  type EdgeChange,
  Background,
  Controls,
  MiniMap,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Users, Clock, Timer, Send, Trash2, MessageSquare, Smile, ImagePlus, Pencil, Sparkles } from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import { EmojiReactionPicker } from "@/components/EmojiReactionPicker";
import { SideOver } from "@/components/SideOver";

const BroadcastFlowContext = createContext<{
  apiHeaders?: Record<string, string>;
  onOpenConfig: (nodeId: string) => void;
}>({ onOpenConfig: () => {} });

function useDeleteNode() {
  const { setNodes, setEdges } = useReactFlow();
  return useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    },
    [setNodes, setEdges]
  );
}

type RoundNodeProps = NodeProps & {
  icon: React.ReactNode;
  label: string;
  colorClass: string;
};

function RoundNodeBase({ id, icon, label, colorClass }: RoundNodeProps) {
  const { onOpenConfig } = useContext(BroadcastFlowContext);

  return (
    <div className="flex flex-col items-center gap-2 w-[80px]">
      <div className="relative">
        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-[#94A3B8] !border-2 !border-white" />
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white shadow-md ${colorClass}`}
        >
          <div className="text-white">{icon}</div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenConfig(id);
          }}
          className="nodrag nopan absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white border border-[#E2E8F0] shadow-sm text-[#64748B] hover:bg-[#F8FAFC] hover:text-clicvend-orange hover:border-clicvend-orange/50"
          title="Configurar"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-[#94A3B8] !border-2 !border-white" />
      </div>
      <span className="text-[10px] font-medium text-[#475569] text-center leading-tight">{label}</span>
    </div>
  );
}

function ListaNode(props: NodeProps) {
  return (
    <div className="group relative">
      <RoundNodeBase
        {...props}
        icon={<Users className="h-6 w-6" />}
        label="Lista de contatos"
        colorClass="bg-blue-500"
      />
    </div>
  );
}

function HorarioNode(props: NodeProps) {
  return (
    <div className="group relative">
      <RoundNodeBase
        {...props}
        icon={<Clock className="h-6 w-6" />}
        label="Horário de envio"
        colorClass="bg-amber-500"
      />
    </div>
  );
}

function DelayNode(props: NodeProps) {
  return (
    <div className="group relative">
      <RoundNodeBase
        {...props}
        icon={<Timer className="h-6 w-6" />}
        label="Cadência (delay)"
        colorClass="bg-emerald-500"
      />
    </div>
  );
}

function MensagemNode(props: NodeProps) {
  return (
    <div className="group relative">
      <RoundNodeBase
        {...props}
        icon={<MessageSquare className="h-6 w-6" />}
        label="Mensagem"
        colorClass="bg-sky-500"
      />
    </div>
  );
}

function EnvioNode(props: NodeProps) {
  return (
    <div className="group relative">
      <RoundNodeBase
        {...props}
        icon={<Send className="h-6 w-6" />}
        label="Envio"
        colorClass="bg-violet-500"
      />
    </div>
  );
}

const nodeTypes = {
  lista: ListaNode,
  horario: HorarioNode,
  delay: DelayNode,
  mensagem: MensagemNode,
  envio: EnvioNode,
};

const initialNodes: Node[] = [
  { id: "lista", type: "lista", position: { x: 40, y: 100 }, data: { nome: "" } },
  { id: "horario", type: "horario", position: { x: 180, y: 100 }, data: { inicio: "", fim: "" } },
  { id: "delay", type: "delay", position: { x: 320, y: 100 }, data: { min: "25", max: "45" } },
  { id: "mensagem", type: "mensagem", position: { x: 460, y: 100 }, data: { text: "", file: "", titulo: "" } },
  { id: "envio", type: "envio", position: { x: 600, y: 100 }, data: { tipo: "otimizado" } },
];

const initialEdges: Edge[] = [
  { id: "e-lista-horario", source: "lista", target: "horario" },
  { id: "e-horario-delay", source: "horario", target: "delay" },
  { id: "e-delay-mensagem", source: "delay", target: "mensagem" },
  { id: "e-mensagem-envio", source: "mensagem", target: "envio" },
];

export type BroadcastFlowConfig = {
  lista?: { nome?: string };
  horario?: { inicio?: string; fim?: string };
  delay?: { min?: string; max?: string };
  mensagem?: { text?: string; file?: string; titulo?: string };
  envio?: { tipo?: string };
};

export type BroadcastFlowCanvasProps = {
  recipientCount?: number;
  pipelineName?: string;
  onPipelineNameChange?: (name: string) => void;
  onSave?: (payload: { name: string; config: BroadcastFlowConfig }, options?: { schedule?: boolean }) => void;
  saving?: boolean;
  apiHeaders?: Record<string, string>;
  className?: string;
  /** Config inicial ao editar um fluxo existente */
  initialConfig?: BroadcastFlowConfig;
};

function nodesFromConfig(config: BroadcastFlowConfig): Node[] {
  const c = config ?? {};
  return [
    { id: "lista", type: "lista", position: { x: 40, y: 100 }, data: { nome: c.lista?.nome ?? "" } },
    { id: "horario", type: "horario", position: { x: 180, y: 100 }, data: { inicio: c.horario?.inicio ?? "", fim: c.horario?.fim ?? "" } },
    { id: "delay", type: "delay", position: { x: 320, y: 100 }, data: { min: c.delay?.min ?? "25", max: c.delay?.max ?? "45" } },
    { id: "mensagem", type: "mensagem", position: { x: 460, y: 100 }, data: { text: c.mensagem?.text ?? "", file: c.mensagem?.file ?? "", titulo: c.mensagem?.titulo ?? "" } },
    { id: "envio", type: "envio", position: { x: 600, y: 100 }, data: { tipo: c.envio?.tipo ?? "otimizado" } },
  ];
}

function NodeConfigSideOver({
  open,
  onClose,
  nodeId,
  nodeType,
  data,
  onUpdate,
  onDelete,
  apiHeaders,
}: {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  nodeType: string;
  data: Record<string, unknown>;
  onUpdate: (field: string, value: string) => void;
  onDelete: () => void;
  apiHeaders?: Record<string, string>;
}) {
  const [imageUploading, setImageUploading] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const handleImageUpload = useCallback(
    async (file: File) => {
      setImageUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("type", "broadcast-image");
        const res = await fetch("/api/upload/company-asset", {
          method: "POST",
          body: form,
          headers: apiHeaders ?? {},
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.url) onUpdate("file", json.url);
      } finally {
        setImageUploading(false);
      }
    },
    [apiHeaders, onUpdate]
  );

  const titles: Record<string, string> = {
    lista: "Configurar Lista de contatos",
    horario: "Configurar Horário de envio",
    delay: "Configurar Cadência (delay)",
    mensagem: "Configurar Mensagem",
    envio: "Configurar Envio",
  };

  return (
    <SideOver open={open} onClose={onClose} title={titles[nodeType] ?? "Configurar"} width={nodeType === "mensagem" ? 560 : 420}>
      <div className="space-y-4">
        {nodeType === "lista" && (
          <div>
            <label className="block text-sm font-medium text-[#334155] mb-1">Nome da lista</label>
            <input
              value={String(data.nome ?? "")}
              onChange={(e) => onUpdate("nome", e.target.value)}
              placeholder="Ex: Clientes VIP"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            />
          </div>
        )}

        {nodeType === "horario" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Início (ex: 09:00)</label>
              <input
                type="time"
                value={String(data.inicio ?? "")}
                onChange={(e) => onUpdate("inicio", e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Fim (ex: 18:00)</label>
              <input
                type="time"
                value={String(data.fim ?? "")}
                onChange={(e) => onUpdate("fim", e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
          </div>
        )}

        {nodeType === "delay" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Mín (segundos)</label>
              <input
                type="number"
                min={1}
                value={String(data.min ?? "25")}
                onChange={(e) => onUpdate("min", e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Máx (segundos)</label>
              <input
                type="number"
                min={1}
                value={String(data.max ?? "45")}
                onChange={(e) => onUpdate("max", e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
            </div>
          </div>
        )}

        {nodeType === "mensagem" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Título da mensagem</label>
              <input
                value={String(data.titulo ?? "")}
                onChange={(e) => onUpdate("titulo", e.target.value)}
                placeholder="Ex: Convite aniversário, Promoção Black Friday..."
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
              <p className="mt-0.5 text-xs text-[#64748B]">O título ajuda o mini agente a sugerir textos mais adequados.</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-[#334155]">Texto</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setEmojiPickerOpen((v) => !v)}
                    className="p-1.5 rounded text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#1E293B]"
                    title="Inserir emoji"
                  >
                    <Smile className="h-4 w-4" />
                  </button>
                  {emojiPickerOpen && (
                    <div className="absolute top-full right-0 mt-1 z-50">
                      <EmojiReactionPicker
                        onSelect={(emoji) => onUpdate("text", String(data.text ?? "") + emoji)}
                        onClose={() => setEmojiPickerOpen(false)}
                      />
                    </div>
                  )}
                </div>
              </div>
              <textarea
                value={String(data.text ?? "")}
                onChange={(e) => onUpdate("text", e.target.value)}
                placeholder="Digite a mensagem... Use *negrito* e _itálico_ para WhatsApp"
                rows={4}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm resize-y focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const text = String(data.text ?? "").trim();
                    if (!text) {
                      setSuggestError("Digite ou cole um texto para sugerir melhorias.");
                      return;
                    }
                    setSuggestLoading(true);
                    setSuggestError(null);
                    try {
                      const res = await fetch("/api/ai/suggest-message", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json", ...(apiHeaders ?? {}) },
                        body: JSON.stringify({
                          titulo: String(data.titulo ?? "").trim(),
                          text,
                        }),
                      });
                      const json = await res.json().catch(() => ({}));
                      if (res.ok && json?.suggested) {
                        onUpdate("text", json.suggested);
                        setSuggestError(null);
                      } else {
                        setSuggestError(json?.error ?? "Sugestão indisponível no momento.");
                      }
                    } catch {
                      setSuggestError("Erro de rede. Tente novamente.");
                    } finally {
                      setSuggestLoading(false);
                    }
                  }}
                  disabled={suggestLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-[#475569] hover:bg-[#F8FAFC] hover:border-clicvend-orange/50 hover:text-clicvend-orange disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Sparkles className="h-4 w-4" />
                  {suggestLoading ? "Sugerindo…" : "Sugerir melhorias"}
                </button>
                {suggestError && (
                  <span className="text-xs text-red-600">{suggestError}</span>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1">Imagem</label>
              {data.file ? (
                <div className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-emerald-50/50 px-3 py-2">
                  <ImagePlus className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-sm text-emerald-700 flex-1 truncate">✓ Imagem anexada</span>
                  <button
                    type="button"
                    onClick={() => onUpdate("file", "")}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Remover
                  </button>
                </div>
              ) : (
                <FileDropzone
                  accept="image/*"
                  maxSize={5 * 1024 * 1024}
                  loading={imageUploading}
                  label="Arraste uma imagem ou clique para selecionar"
                  onFileSelect={handleImageUpload}
                />
              )}
            </div>
          </div>
        )}

        {nodeType === "envio" && (
          <div>
            <label className="block text-sm font-medium text-[#334155] mb-1">Modo</label>
            <select
              value={String(data.tipo ?? "otimizado")}
              onChange={(e) => onUpdate("tipo", e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
            >
              <option value="otimizado">Otimizado (25–45s)</option>
              <option value="manual">Manual (~35s)</option>
            </select>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 border-t border-[#E2E8F0] pt-4">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 hover:underline"
            >
              <Trash2 className="h-4 w-4" />
              Excluir nó
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      </div>
    </SideOver>
  );
}

function BroadcastFlowCanvasInner({
  recipientCount = 0,
  pipelineName = "",
  onPipelineNameChange,
  onSave,
  saving = false,
  apiHeaders,
  className = "",
  initialConfig,
}: BroadcastFlowCanvasProps) {
  const [nodes, setNodes] = useState<Node[]>(() =>
    initialConfig ? nodesFromConfig(initialConfig) : initialNodes
  );
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [configNodeId, setConfigNodeId] = useState<string | null>(null);
  const [scheduleOnSave, setScheduleOnSave] = useState(false);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    []
  );

  const updateNodeData = useCallback((nodeId: string, field: string, value: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, [field]: value } } : n
      )
    );
  }, []);

  const deleteNode = useDeleteNode();
  const configNode = configNodeId ? nodes.find((n) => n.id === configNodeId) : null;

  const contextValue = {
    apiHeaders,
    onOpenConfig: setConfigNodeId,
  };

  const handleSave = useCallback(() => {
    if (!onSave) return;
    const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const config: BroadcastFlowConfig = {
      lista: nodeById.lista?.data ? { nome: String(nodeById.lista.data.nome ?? "") } : undefined,
      horario: nodeById.horario?.data ? { inicio: String(nodeById.horario.data.inicio ?? ""), fim: String(nodeById.horario.data.fim ?? "") } : undefined,
      delay: nodeById.delay?.data ? { min: String(nodeById.delay.data.min ?? "25"), max: String(nodeById.delay.data.max ?? "45") } : undefined,
      mensagem: nodeById.mensagem?.data ? { text: String(nodeById.mensagem.data.text ?? ""), file: String(nodeById.mensagem.data.file ?? ""), titulo: String(nodeById.mensagem.data.titulo ?? "") } : undefined,
      envio: nodeById.envio?.data ? { tipo: String(nodeById.envio.data.tipo ?? "otimizado") } : undefined,
    };
    onSave({ name: pipelineName, config }, { schedule: scheduleOnSave });
  }, [nodes, pipelineName, scheduleOnSave, onSave]);

  return (
    <BroadcastFlowContext.Provider value={contextValue}>
      <div className={`flex flex-col gap-4 min-h-0 ${className}`}>
        <div className="shrink-0">
          <label htmlFor="pipeline-name" className="block text-sm font-medium text-[#334155] mb-1">
            Nome do pipeline
          </label>
          <input
            id="pipeline-name"
            value={pipelineName}
            onChange={(e) => onPipelineNameChange?.(e.target.value)}
            placeholder="Ex: Campanha Janeiro"
            className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
          />
        </div>
        {recipientCount > 0 && (
          <p className="text-sm text-[#64748B] shrink-0">
            {recipientCount} contato(s) na fila — clique no lápis em cada nó para configurar.
          </p>
        )}
        <div className="flex-1 min-h-[350px] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            defaultEdgeOptions={{ type: "smoothstep" }}
            connectionLineType={ConnectionLineType.SmoothStep}
            fitView
            className="bg-[#F8FAFC] w-full h-full"
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[#94A3B8]">
            Clique no ícone de lápis em cada nó para configurar. Arraste os nós para reorganizar.
          </p>
          <div className="flex flex-col gap-3 pt-2 border-t border-[#E2E8F0]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleOnSave}
                onChange={(e) => setScheduleOnSave(e.target.checked)}
                className="h-4 w-4 rounded border-[#E2E8F0] text-clicvend-orange focus:ring-clicvend-orange"
              />
              <span className="text-xs text-[#64748B]">Agendar execução no horário configurado</span>
            </label>
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-[#64748B]">
                O fluxo define: <strong>Lista</strong> → <strong>Horário</strong> → <strong>Cadência</strong> → <strong>Mensagem</strong> (texto + imagem) → <strong>Envio</strong>.
              </p>
              {onSave && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Salvando…
                  </>
                ) : (
                  "Salvar fluxo"
                )}
              </button>
            )}
            </div>
          </div>
        </div>
      </div>

      {configNode && (
        <NodeConfigSideOver
          open={!!configNodeId}
          onClose={() => setConfigNodeId(null)}
          nodeId={configNode.id}
          nodeType={configNode.type ?? "lista"}
          data={(configNode.data ?? {}) as Record<string, unknown>}
          onUpdate={(field, value) => updateNodeData(configNode.id, field, value)}
          onDelete={() => deleteNode(configNode.id)}
          apiHeaders={apiHeaders}
        />
      )}
    </BroadcastFlowContext.Provider>
  );
}

export function BroadcastFlowCanvas(props: BroadcastFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <BroadcastFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
