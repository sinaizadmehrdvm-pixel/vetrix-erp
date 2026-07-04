import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const data = [
  { name: "Inventory", value: 400 },
  { name: "Marketing", value: 300 },
  { name: "Salary", value: 500 },
  { name: "Other", value: 200 },
];

const COLORS = ["#22d3ee", "#6366f1", "#10b981", "#f59e0b"];

export default function ExpenseChart() {
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.8)",
        borderRadius: 24,
        padding: 20,
        height: 350,
      }}
    >
      <h2 style={{ color: "white", marginBottom: 20 }}>
        Expense Analytics
      </h2>

      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            outerRadius={120}
          >
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>

          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}