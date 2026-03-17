"use client";

import { useCallback, useState } from "react";
import {
  ReactFlow,
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
import { SideOver } from "@/components/SideOver";
import { Users, Clock, Timer, Send, Trash2, MessageSquare } from "lucide-react";

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

function ListaNode({ id, data }: NodeProps) {
  const { setNodes } = useReactFlow();
  const deleteNode = useDeleteNode();
  const nome = (data.nome as string) ?? "";

  const updateData = useCallback(
    (field: string, value: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n
        )
      );
    },
    [id, setNodes]
  );

  return (
    <div className="min-w-[200px] rounded-lg border border-[#E2E8F0] bg-white shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-[#94A3B8]" />
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="flex items-center gap-2 text-sm font-medium text-[#1E293B]">
          <Users className="h-4 w-4 text-blue-600 shrink-0" />
          Lista de contatos
        </div>
        <button
          type="button"
          onClick={() => deleteNode(id)}
          className="nodrag nopan rounded p-1 text-[#94A3B8] hover:bg-red-50 hover:text-red-600"
          aria-label="Excluir"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="px-3 py-2.5">
        <div>
          <label htmlFor={`${id}-nome`} className="block text-xs text-[#64748B] mb-0.5">
            Nome da lista
          </label>
          <input
            id={`${id}-nome`}
            value={nome}
            onChange={(e) => updateData("nome", e.target.value)}
            placeholder="Ex: Clientes VIP"
            className="nodrag w-full rounded border border-[#E2E8F0] px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-[#94A3B8]" />
    </div>
  );
}

function HorarioNode({ id, data }: NodeProps) {
  const { setNodes } = useReactFlow();
  const deleteNode = useDeleteNode();
  const inicio = (data.inicio as string) ?? "";
  const fim = (data.fim as string) ?? "";

  const updateData = useCallback(
    (field: string, value: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n
        )
      );
    },
    [id, setNodes]
  );

  return (
    <div className="min-w-[200px] rounded-lg border border-[#E2E8F0] bg-white shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-[#94A3B8]" />
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="flex items-center gap-2 text-sm font-medium text-[#1E293B]">
          <Clock className="h-4 w-4 text-amber-600 shrink-0" />
          Horário de envio
        </div>
        <button
          type="button"
          onClick={() => deleteNode(id)}
          className="nodrag nopan rounded p-1 text-[#94A3B8] hover:bg-red-50 hover:text-red-600"
          aria-label="Excluir"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="px-3 py-2.5 space-y-2">
        <div>
          <label htmlFor={`${id}-inicio`} className="block text-xs text-[#64748B] mb-0.5">
            Início (ex: 09:00)
          </label>
          <input
            id={`${id}-inicio`}
            type="time"
            value={inicio}
            onChange={(e) => updateData("inicio", e.target.value)}
            className="nodrag w-full rounded border border-[#E2E8F0] px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor={`${id}-fim`} className="block text-xs text-[#64748B] mb-0.5">
            Fim (ex: 18:00)
          </label>
          <input
            id={`${id}-fim`}
            type="time"
            value={fim}
            onChange={(e) => updateData("fim", e.target.value)}
            className="nodrag w-full rounded border border-[#E2E8F0] px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-[#94A3B8]" />
    </div>
  );
}

function DelayNode({ id, data }: NodeProps) {
  const { setNodes } = useReactFlow();
  const deleteNode = useDeleteNode();
  const min = (data.min as string) ?? "25";
  const max = (data.max as string) ?? "45";

  const updateData = useCallback(
    (field: string, value: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n
        )
      );
    },
    [id, setNodes]
  );

  return (
    <div className="min-w-[200px] rounded-lg border border-[#E2E8F0] bg-white shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-[#94A3B8]" />
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="flex items-center gap-2 text-sm font-medium text-[#1E293B]">
          <Timer className="h-4 w-4 text-emerald-600 shrink-0" />
          Cadência (delay)
        </div>
        <button
          type="button"
          onClick={() => deleteNode(id)}
          className="nodrag nopan rounded p-1 text-[#94A3B8] hover:bg-red-50 hover:text-red-600"
          aria-label="Excluir"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="px-3 py-2.5 space-y-2">
        <div>
          <label htmlFor={`${id}-min`} className="block text-xs text-[#64748B] mb-0.5">
            Mín (segundos)
          </label>
          <input
            id={`${id}-min`}
            type="number"
            min={1}
            value={min}
            onChange={(e) => updateData("min", e.target.value)}
            className="nodrag w-full rounded border border-[#E2E8F0] px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor={`${id}-max`} className="block text-xs text-[#64748B] mb-0.5">
            Máx (segundos)
          </label>
          <input
            id={`${id}-max`}
            type="number"
            min={1}
            value={max}
            onChange={(e) => updateData("max", e.target.value)}
            className="nodrag w-full rounded border border-[#E2E8F0] px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-[#94A3B8]" />
    </div>
  );
}

function MensagemNode({ id, data }: NodeProps) {
  const { setNodes } = useReactFlow();
  const deleteNode = useDeleteNode();
  const text = (data.text as string) ?? "";
  const hasImage = !!(data.file as string);

  const updateData = useCallback(
    (field: string, value: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n
        )
      );
    },
    [id, setNodes]
  );

  return (
    <div className="min-w-[220px] rounded-lg border border-[#E2E8F0] bg-white shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-[#94A3B8]" />
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="flex items-center gap-2 text-sm font-medium text-[#1E293B]">
          <MessageSquare className="h-4 w-4 text-sky-600 shrink-0" />
          Mensagem
        </div>
        <button
          type="button"
          onClick={() => deleteNode(id)}
          className="nodrag nopan rounded p-1 text-[#94A3B8] hover:bg-red-50 hover:text-red-600"
          aria-label="Excluir"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="px-3 py-2.5 space-y-2">
        <div>
          <label htmlFor={`${id}-text`} className="block text-xs text-[#64748B] mb-0.5">
            Texto
          </label>
          <textarea
            id={`${id}-text`}
            value={text}
            onChange={(e) => updateData("text", e.target.value)}
            placeholder="Digite a mensagem..."
            rows={3}
            className="nodrag w-full rounded border border-[#E2E8F0] px-2 py-1.5 text-sm resize-none"
          />
        </div>
        <div>
          <label htmlFor={`${id}-file`} className="block text-xs text-[#64748B] mb-0.5">
            Imagem (URL ou base64)
          </label>
          <input
            id={`${id}-file`}
            value={(data.file as string) ?? ""}
            onChange={(e) => updateData("file", e.target.value)}
            placeholder="Opcional: URL ou base64"
            className="nodrag w-full rounded border border-[#E2E8F0] px-2 py-1.5 text-sm text-[11px]"
          />
          {hasImage && <span className="text-[10px] text-emerald-600 mt-0.5 block">✓ Imagem anexada</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-[#94A3B8]" />
    </div>
  );
}

function EnvioNode({ id, data }: NodeProps) {
  const { setNodes } = useReactFlow();
  const deleteNode = useDeleteNode();
  const tipo = (data.tipo as string) ?? "otimizado";

  const updateData = useCallback(
    (field: string, value: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n
        )
      );
    },
    [id, setNodes]
  );

  return (
    <div className="min-w-[200px] rounded-lg border border-[#E2E8F0] bg-white shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-[#94A3B8]" />
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="flex items-center gap-2 text-sm font-medium text-[#1E293B]">
          <Send className="h-4 w-4 text-violet-600 shrink-0" />
          Envio
        </div>
        <button
          type="button"
          onClick={() => deleteNode(id)}
          className="nodrag nopan rounded p-1 text-[#94A3B8] hover:bg-red-50 hover:text-red-600"
          aria-label="Excluir"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="px-3 py-2.5">
        <div>
          <label htmlFor={`${id}-tipo`} className="block text-xs text-[#64748B] mb-0.5">
            Modo
          </label>
          <select
            id={`${id}-tipo`}
            value={tipo}
            onChange={(e) => updateData("tipo", e.target.value)}
            className="nodrag w-full rounded border border-[#E2E8F0] px-2 py-1.5 text-sm"
          >
            <option value="otimizado">Otimizado (25–45s)</option>
            <option value="manual">Manual (~35s)</option>
          </select>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-[#94A3B8]" />
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
  { id: "lista", type: "lista", position: { x: 20, y: 120 }, data: { nome: "" } },
  { id: "horario", type: "horario", position: { x: 280, y: 120 }, data: { inicio: "", fim: "" } },
  { id: "delay", type: "delay", position: { x: 540, y: 120 }, data: { min: "25", max: "45" } },
  { id: "mensagem", type: "mensagem", position: { x: 800, y: 120 }, data: { text: "", file: "" } },
  { id: "envio", type: "envio", position: { x: 1060, y: 120 }, data: { tipo: "otimizado" } },
];

const initialEdges: Edge[] = [
  { id: "e-lista-horario", source: "lista", target: "horario" },
  { id: "e-horario-delay", source: "horario", target: "delay" },
  { id: "e-delay-mensagem", source: "delay", target: "mensagem" },
  { id: "e-mensagem-envio", source: "mensagem", target: "envio" },
];

export type BroadcastFlowSideOverProps = {
  open: boolean;
  onClose: () => void;
  recipientCount?: number;
};

export function BroadcastFlowSideOver({
  open,
  onClose,
  recipientCount = 0,
}: BroadcastFlowSideOverProps) {
  const [pipelineName, setPipelineName] = useState("");
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

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

  return (
    <SideOver
      open={open}
      onClose={onClose}
      title="Fluxo de envio"
      width="75vw"
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="pipeline-name" className="block text-sm font-medium text-[#334155] mb-1">
            Nome do pipeline
          </label>
          <input
            id="pipeline-name"
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            placeholder="Ex: Campanha Janeiro"
            className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] placeholder-[#94A3B8] focus:border-clicvend-orange focus:outline-none focus:ring-1 focus:ring-clicvend-orange"
          />
        </div>
        {recipientCount > 0 && (
          <p className="text-sm text-[#64748B]">
            {recipientCount} contato(s) na fila — configure cada etapa abaixo.
          </p>
        )}
        <div className="h-[550px] w-full min-h-[450px] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] overflow-hidden">
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
            className="bg-[#F8FAFC]"
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[#94A3B8]">
            Preencha os campos em cada card. Clique no ícone de lixeira para excluir um card. Arraste os nós para reorganizar.
          </p>
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#E2E8F0]">
            <p className="text-xs text-[#64748B]">
              O fluxo define: <strong>Lista</strong> → <strong>Horário</strong> → <strong>Cadência</strong> → <strong>Mensagem</strong> (texto + imagem) → <strong>Envio</strong>.
            </p>
            <button
              type="button"
              onClick={() => onClose()}
              className="rounded-lg bg-clicvend-orange px-4 py-2 text-sm font-medium text-white hover:bg-clicvend-orange-dark"
            >
              Salvar fluxo
            </button>
          </div>
        </div>
      </div>
    </SideOver>
  );
}
