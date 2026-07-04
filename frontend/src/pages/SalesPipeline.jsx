
import { useEffect, useState } from "react";
import axios from "axios";

const API = "http://127.0.0.1:8001";

const stages = ["lead", "negotiation", "proposal", "won", "lost"];

export default function SalesPipeline() {
  const [data, setData] = useState([]);

  useEffect(() => {
    axios.get(`${API}/opportunities`).then(r => setData(r.data || []));
  }, []);

  return (
    <div style={{ display: "flex", gap: 12, padding: 20 }}>
      {stages.map(stage => (
        <div key={stage} style={{ flex: 1, background: "#0f172a", padding: 10, borderRadius: 10 }}>
          <h3 style={{ color: "white" }}>{stage}</h3>

          {data.filter(x => x.stage === stage).map(x => (
            <div key={x.id} style={{ background: "#1e293b", margin: 6, padding: 10, borderRadius: 8, color: "white" }}>
              <div>{x.title}</div>
              <div>{x.value}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
