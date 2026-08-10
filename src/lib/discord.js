export async function sendDiscordMessage({ webhookUrl, message, fetchImpl = fetch }) {
  if (!webhookUrl) {
    throw new Error('Discord webhook URL has not been configured.');
  }

  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord webhook failed: ${response.status} ${body}`);
  }
}
