import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const BASE_PORTS = [42884, 42885, 42886, 42887, 42888];

async function callSinglePort(port, method, params) {
  const url = `http://127.0.0.1:${port}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 800); // Fast timeout for local ports
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Bridge port ${port} returned HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "Bridge request failed.");
    }
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function callBridge(method, params = {}) {
  // If specific port requested
  if (params.port) {
    return await callSinglePort(params.port, method, params);
  }

  // Scan all active ports (42884..42888)
  const activeResults = [];

  for (const port of BASE_PORTS) {
    try {
      const res = await callSinglePort(port, method, params);
      activeResults.push(res);
    } catch (e) {
      // Instance not listening on this port
    }
  }

  if (activeResults.length === 0) {
    throw new Error(
      "Ninguna instancia de Onicord está escuchando en los puertos 42884..42888. ¡Asegúrate de iniciar Onicord con 'npm run start'!"
    );
  }

  // Filter by user nickname if specified
  if (params.user || params.nickname) {
    const targetName = (params.user || params.nickname).toLowerCase();
    const match = activeResults.find(
      (r) => r.instanceInfo?.nickname?.toLowerCase() === targetName
    );
    if (!match) {
      throw new Error(
        `Instancia para el usuario "${params.user || params.nickname}" no encontrada. Instancias activas: ${activeResults
          .map((r) => `${r.instanceInfo?.nickname} (Puerto ${r.instanceInfo?.port})`)
          .join(", ")}`
      );
    }
    return match;
  }

  // If only 1 instance active, return its direct result
  if (activeResults.length === 1) {
    return activeResults[0];
  }

  // Multiple active instances detected: return aggregated result side-by-side!
  return {
    multiInstance: true,
    activeInstanceCount: activeResults.length,
    instances: activeResults,
  };
}

const server = new Server(
  {
    name: "onicord-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "onicord_get_live_logs",
        description:
          "Obtiene los últimos registros diagnósticos de OniDiag en tiempo real. Soporta multi-instancia (escanea todas las ventanas abiertas o filtra por 'user' o 'port').",
        inputSchema: {
          type: "object",
          properties: {
            user: {
              type: "string",
              description: "Nombre del usuario de la instancia a consultar (ej. 'Oniverse' o 'Juancarlo')",
            },
            port: {
              type: "number",
              description: "Puerto específico del puente MCP (ej. 42884 o 42885)",
            },
            limit: {
              type: "number",
              description: "Cantidad de registros a obtener (por defecto: 100)",
            },
            category: {
              type: "string",
              description: "Categoría de logs (ej. 'WebRTC', 'Voice', 'P2P', 'Console', 'StdOut', 'StdErr', 'Crash')",
            },
            level: {
              type: "string",
              description: "Nivel de log ('info', 'warn', 'error')",
            },
            search: {
              type: "string",
              description: "Término de búsqueda libre (ej. 'ProcessFrame', 'ICE', 'bitrate')",
            },
          },
        },
      },
      {
        name: "onicord_request_peer_logs",
        description:
          "Solicita remotamente a través de P2P los logs diagnósticos OniDiag de otro par conectado en la sala (ej. 'Juancarlo' o por peerId).",
        inputSchema: {
          type: "object",
          properties: {
            user: {
              type: "string",
              description: "Instancia emisora desde la cual hacer la petición P2P ('Oniverse' o 'Juancarlo')",
            },
            target: {
              type: "string",
              description: "Nombre de usuario o ID del par P2P objetivo",
            },
          },
          required: ["target"],
        },
      },
      {
        name: "onicord_clear_logs",
        description: "Limpia el búfer de diagnósticos OniDiag en memoria para comenzar pruebas con registros limpios.",
        inputSchema: {
          type: "object",
          properties: {
            user: { type: "string", description: "Usuario de la instancia ('Oniverse' o 'Juancarlo')" },
          },
        },
      },
      {
        name: "onicord_get_webrtc_stats",
        description:
          "Consulta el estado y estadísticas en vivo de las conexiones WebRTC P2P activas (bitrate RX/TX, paquetes de audio, transceivers). Soporta multi-instancia.",
        inputSchema: {
          type: "object",
          properties: {
            user: { type: "string", description: "Filtrar por usuario ('Oniverse' o 'Juancarlo')" },
            port: { type: "number", description: "Puerto del puente MCP (42884 o 42885)" },
          },
        },
      },
      {
        name: "onicord_get_app_state",
        description:
          "Inspecciona el estado global de la aplicación Onicord (sala P2P activa, usuario local, pares conectados, canal de voz y estado multimedia) para todas las instancias abiertas.",
        inputSchema: {
          type: "object",
          properties: {
            user: { type: "string", description: "Filtrar por usuario ('Oniverse' o 'Juancarlo')" },
            port: { type: "number", description: "Puerto del puente MCP (42884 o 42885)" },
          },
        },
      },
      {
        name: "onicord_trigger_action",
        description:
          "Ejecuta cualquier atajo de teclado o acción registrada en Onicord (toggle_mute, toggle_deafen, toggle_stream, disconnect_voice, switch_server_next, open_settings).",
        inputSchema: {
          type: "object",
          properties: {
            user: { type: "string", description: "Instancia a controlar ('Oniverse' o 'Juancarlo')" },
            action: {
              type: "string",
              description: "Nombre de la acción (ej. 'toggle_mute', 'toggle_deafen', 'toggle_stream', 'disconnect_voice')",
            },
            shortcut: {
              type: "string",
              description: "Combinación opcional de teclado (ej. 'Ctrl + Shift + M')",
            },
          },
          required: ["action"],
        },
      },
      {
        name: "onicord_send_input_event",
        description: "Simula eventos nativos de teclado/ratón en Chromium (sendInputEvent) para interactuar con la ventana.",
        inputSchema: {
          type: "object",
          properties: {
            user: { type: "string", description: "Instancia objetivo ('Oniverse' o 'Juancarlo')" },
            type: { type: "string", description: "Tipo de evento ('keyDown', 'keyUp', 'char')" },
            keyCode: { type: "string", description: "Código de la tecla (ej. 'Control', 'Escape', 'Enter')" },
            modifiers: { type: "array", items: { type: "string" }, description: "Modificadores" },
          },
        },
      },
      {
        name: "onicord_join_voice_channel",
        description: "Ingresa a un canal de voz específico de la sala activa.",
        inputSchema: {
          type: "object",
          properties: {
            user: { type: "string", description: "Instancia objetivo ('Oniverse' o 'Juancarlo')" },
            channelId: { type: "string", description: "ID del canal de voz objetivo" },
          },
          required: ["channelId"],
        },
      },
      {
        name: "onicord_leave_voice_channel",
        description: "Abandona el canal de voz activo y libera recursos multimedia.",
        inputSchema: {
          type: "object",
          properties: {
            user: { type: "string", description: "Instancia objetivo ('Oniverse' o 'Juancarlo')" },
          },
        },
      },
      {
        name: "onicord_toggle_media",
        description: "Alterna estados de micrófono, auriculares o transmisión de pantalla ('mute', 'unmute', 'deafen', 'undeafen', 'start_stream', 'stop_stream').",
        inputSchema: {
          type: "object",
          properties: {
            user: { type: "string", description: "Instancia objetivo ('Oniverse' o 'Juancarlo')" },
            action: { type: "string", description: "Acción multimedia" },
          },
          required: ["action"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    switch (name) {
      case "onicord_get_live_logs":
        result = await callBridge("get_live_logs", args);
        break;
      case "onicord_request_peer_logs":
        result = await callBridge("request_peer_logs", args);
        break;
      case "onicord_clear_logs":
        result = await callBridge("clear_logs", args);
        break;
      case "onicord_get_webrtc_stats":
        result = await callBridge("get_webrtc_stats", args);
        break;
      case "onicord_get_app_state":
        result = await callBridge("get_app_state", args);
        break;
      case "onicord_trigger_action":
        result = await callBridge("trigger_action", args);
        break;
      case "onicord_send_input_event":
        result = await callBridge("send_input_event", args);
        break;
      case "onicord_join_voice_channel":
        result = await callBridge("join_voice_channel", args);
        break;
      case "onicord_leave_voice_channel":
        result = await callBridge("leave_voice_channel", args);
        break;
      case "onicord_toggle_media":
        result = await callBridge("toggle_media", args);
        break;
      default:
        throw new Error(`Herramienta desconocida: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error ejecutando ${name}: ${err.message}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[onicord-mcp] Servidor MCP nativo de Onicord iniciado mediante STDIO con soporte multi-instancia.");
}

main().catch((err) => {
  console.error("[onicord-mcp] Error fatal iniciando servidor MCP:", err);
  process.exit(1);
});
