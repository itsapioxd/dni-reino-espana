
const commands = [
  {
    name: "solicitar-dni",
    description: "Solicita tu DNI del Reino de España RP"
  },
  {
    name: "mi-dni",
    description: "Consulta tu DNI"
  },
  {
    name: "ver-dni",
    description: "Consulta un DNI",
    options: [{
      name: "numero",
      description: "Número del DNI",
      type: 3,
      required: true
    }]
  },
  {
    name: "anular-dni",
    description: "Anula un DNI (administradores)",
    default_member_permissions: "32",
    options: [{
      name: "numero",
      description: "Número del DNI",
      type: 3,
      required: true
    }]
  }
];

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) {
    throw new Error("Firma no válida");
  }
  return new Uint8Array(
    hex.match(/.{2}/g).map(byte => parseInt(byte, 16))
  );
}

async function verifyDiscord(request, body, publicKey) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");

  if (!signature || !timestamp || !publicKey) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const message = new TextEncoder().encode(timestamp + body);

    return await crypto.subtle.verify(
      "Ed25519",
      key,
      hexToBytes(signature),
      message
    );
  } catch {
    return false;
  }
}

function ephemeral(content) {
  return {
    type: 4,
    data: { content, flags: 64 }
  };
}

function inputRow(id, label, placeholder, style = 1) {
  return {
    type: 1,
    components: [{
      type: 4,
      custom_id: id,
      label,
      style,
      placeholder,
      required: true,
      max_length: 100
    }]
  };
}

function getInput(interaction, id) {
  for (const row of interaction.data.components || []) {
    for (const component of row.components || []) {
      if (component.custom_id === id) return component.value;
    }
  }
  return "";
}

async function handleInteraction(interaction, env) {
  const user = interaction.member?.user || interaction.user;
  const userId = user?.id;

  if (interaction.type === 1) {
    return { type: 1 };
  }

  if (interaction.type === 2) {
    const name = interaction.data.name;

    if (name === "solicitar-dni") {
      return {
        type: 9,
        data: {
          custom_id: "dni_form",
          title: "Solicitud de DNI RP",
          components: [
            inputRow("nombre", "Nombre del personaje", "Ejemplo: Carlos"),
            inputRow("apellidos", "Apellidos del personaje", "Ejemplo: García López"),
            inputRow("nacimiento", "Fecha de nacimiento", "AAAA-MM-DD")
          ]
        }
      };
    }

    if (name === "mi-dni") {
      const dni = await env.DB.prepare(
        "SELECT * FROM dnis WHERE discord_id = ? AND estado = 'ACTIVO' ORDER BY id DESC LIMIT 1"
      ).bind(userId).first();

      if (!dni) return ephemeral("No tienes ningún DNI activo.");

      return ephemeral(
        `🇪🇸 **TU DNI DEL REINO DE ESPAÑA RP**\n` +
        `Número: **${dni.numero}**\n` +
        `Nombre: ${dni.nombre} ${dni.apellidos}\n` +
        `Nacimiento: ${dni.fecha_nacimiento}\n` +
        `Estado: ${dni.estado}\n\n` +
        "Documento ficticio de roleplay."
      );
    }

    if (name === "ver-dni" || name === "anular-dni") {
      const numero = interaction.data.options?.[0]?.value?.trim().toUpperCase();

      if (name === "anular-dni") {
        const permissions = BigInt(interaction.member?.permissions || "0");
        const allowed = (permissions & (8n | 32n)) !== 0n;

        if (!allowed) {
          return ephemeral("No tienes permisos para anular DNI.");
        }

        const result = await env.DB.prepare(
          "UPDATE dnis SET estado = 'ANULADO' WHERE numero = ? AND estado = 'ACTIVO'"
        ).bind(numero).run();

        return ephemeral(
          result.meta.changes > 0
            ? `El DNI **${numero}** ha sido anulado.`
            : "No se encontró un DNI activo con ese número."
        );
      }

      const dni = await env.DB.prepare(
        "SELECT numero, nombre, apellidos, fecha_nacimiento, estado FROM dnis WHERE numero = ?"
      ).bind(numero).first();

      if (!dni) return ephemeral("No se encontró ese DNI.");

      return ephemeral(
        `🇪🇸 **CONSULTA DE DNI RP**\n` +
        `Número: **${dni.numero}**\n` +
        `Nombre: ${dni.nombre} ${dni.apellidos}\n` +
        `Nacimiento: ${dni.fecha_nacimiento}\n` +
        `Estado: ${dni.estado}\n\n` +
        "Documento ficticio de roleplay."
      );
    }
  }

  if (interaction.type === 5 && interaction.data.custom_id === "dni_form") {
    const nombre = getInput(interaction, "nombre").trim();
    const apellidos = getInput(interaction, "apellidos").trim();
    const nacimiento = getInput(interaction, "nacimiento").trim();

    if (!nombre || !apellidos) {
      return ephemeral("Debes rellenar todos los campos.");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(nacimiento)) {
      return ephemeral("La fecha debe tener formato AAAA-MM-DD.");
    }

    const date = new Date(nacimiento + "T00:00:00Z");

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== nacimiento ||
      nacimiento > new Date().toISOString().slice(0, 10)
    ) {
      return ephemeral("La fecha de nacimiento no es válida.");
    }

    const existing = await env.DB.prepare(
      "SELECT numero FROM dnis WHERE discord_id = ? AND estado = 'ACTIVO' LIMIT 1"
    ).bind(userId).first();

    if (existing) {
      return ephemeral(`Ya tienes un DNI activo: **${existing.numero}**. Usa /mi-dni.`);
    }

    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS dni_counter (id INTEGER PRIMARY KEY, next_number INTEGER NOT NULL)"
    ).run();

    const counter = await env.DB.prepare(
      "INSERT INTO dni_counter (id, next_number) VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET next_number = next_number + 1 RETURNING next_number"
    ).first();

    const numero = "RP-" + String(counter.next_number).padStart(6, "0");

    await env.DB.prepare(
      "INSERT INTO dnis (numero, discord_id, nombre, apellidos, fecha_nacimiento, estado) VALUES (?, ?, ?, ?, ?, 'ACTIVO')"
    ).bind(numero, userId, nombre, apellidos, nacimiento).run();

    return ephemeral(
      `🇪🇸 **¡DNI EXPEDIDO CORRECTAMENTE!**\n\n` +
      `Número: **${numero}**\n` +
      `Nombre: ${nombre} ${apellidos}\n` +
      `Nacimiento: ${nacimiento}\n` +
      `Estado: ACTIVO\n\n` +
      "Documento ficticio del Reino de España RP."
    );
  }

  return ephemeral("Interacción no reconocida.");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("🇪🇸 Sistema DNI Reino de España RP operativo");
    }

    if (request.method === "GET" && url.pathname === "/setup") {
      if (!env.SETUP_SECRET || url.searchParams.get("key") !== env.SETUP_SECRET) {
        return new Response("No autorizado", { status: 403 });
      }

      if (!env.APPLICATION_ID || !env.GUILD_ID || !env.DISCORD_BOT_TOKEN) {
        return new Response("Faltan variables de configuración", { status: 500 });
      }

      const result = await fetch(
        `https://discord.com/api/v10/applications/${env.APPLICATION_ID}/guilds/${env.GUILD_ID}/commands`,
        {
          method: "PUT",
          headers: {
            "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(commands)
        }
      );

      const text = await result.text();

      return new Response(
        result.ok
          ? "¡Comandos registrados correctamente! Ya puedes volver a Discord."
          : `Error de Discord (${result.status}): ${text}`,
        { status: result.ok ? 200 : 500 }
      );
    }

    if (request.method !== "POST") {
      return new Response("Método no permitido", { status: 405 });
    }

    const body = await request.text();

    const valid = await verifyDiscord(
      request,
      body,
      env.DISCORD_PUBLIC_KEY
    );

    if (!valid) {
      return new Response("Firma no válida", { status: 401 });
    }

    try {
      const interaction = JSON.parse(body);
      const result = await handleInteraction(interaction, env);
      return response(result);
    } catch (error) {
      return response(ephemeral("Se ha producido un error interno. Contacta con un administrador."));
    }
  }
};
