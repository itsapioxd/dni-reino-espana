
const corsHeaders = {
  "Content-Type": "application/json"
};

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("DNI Reino de España RP activo", {
        status: 200
      });
    }

    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");
    const body = await request.text();

    if (!signature || !timestamp ||
        !await verifyDiscordRequest(body, signature, timestamp, env.DISCORD_PUBLIC_KEY)) {
      return new Response("Invalid request", { status: 401 });
    }

    const interaction = JSON.parse(body);

    if (interaction.type === 1) {
      return Response.json({ type: 1 });
    }

    if (interaction.type === 2) {
      const command = interaction.data.name;

      if (command === "solicitar-dni") {
        return Response.json({
          type: 4,
          data: {
            flags: 64,
            embeds: [{
              title: "🇪🇸 Solicitud de DNI",
              description: "Para expedir tu DNI ficticio, utiliza el formulario de solicitud."
            }]
          }
        });
      }

      if (command === "mi-dni") {
        const result = await env.DB.prepare(
          "SELECT * FROM dnis WHERE discord_id = ? AND estado = 'ACTIVO'"
        ).bind(interaction.member.user.id).first();

        return Response.json({
          type: 4,
          data: {
            flags: 64,
            content: result
              ? `🇪🇸 **Tu DNI RP**\nNúmero: ${result.numero}\nNombre: ${result.nombre} ${result.apellidos}\nNacimiento: ${result.fecha_nacimiento}\nEstado: ${result.estado}`
              : "No tienes ningún DNI expedido."
          }
        });
      }

      if (command === "ver-dni") {
        const numero = interaction.data.options?.[0]?.value;
        const result = await env.DB.prepare(
          "SELECT * FROM dnis WHERE numero = ?"
        ).bind(numero).first();

        return Response.json({
          type: 4,
          data: {
            flags: 64,
            content: result
              ? `🇪🇸 **DNI RP verificado**\nNúmero: ${result.numero}\nNombre: ${result.nombre} ${result.apellidos}\nEstado: ${result.estado}`
              : "DNI no encontrado."
          }
        });
      }
    }

    return Response.json({
      type: 4,
      data: { content: "Comando no reconocido.", flags: 64 }
    });
  }
};

async function verifyDiscordRequest(body, signature, timestamp, publicKey) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    return await crypto.subtle.verify(
      "Ed25519",
      key,
      hexToBytes(signature),
      new TextEncoder().encode(timestamp + body)
    );
  } catch {
    return false;
  }
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) {
    throw new Error("Hexadecimal inválido");
  }
  return new Uint8Array(
    hex.match(/.{2}/g).map(byte => parseInt(byte, 16))
  );
}
