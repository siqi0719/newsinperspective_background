const url = "https://raw.githubusercontent.com/kagisearch/kite-public/main/kite_feeds.json";

console.log("Testing fetch to Kagi Kite feeds...");
console.log("URL:", url);

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  console.log("Status:", response.status);
  console.log("OK:", response.ok);
  
  if (response.ok) {
    const data = await response.json();
    console.log("✅ Successfully fetched feed catalog");
    console.log("Keys:", Object.keys(data).slice(0, 10));
    console.log("Sample structure:", Object.entries(data).slice(0, 2).map(([k, v]) => [k, typeof v === 'object' ? Object.keys(v).slice(0, 3) : v]));
  } else {
    console.log("❌ Response not OK");
  }
} catch (error) {
  console.log("❌ Error:", error.message);
}
