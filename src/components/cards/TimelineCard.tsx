import { Box, FormControlLabel, Switch } from "@mui/material";
import { FunctionComponent } from "react";
import { GeneralStats, MavenPluginStats } from "../../analyzer/analyzer";
import { ExpandableCard } from "./ExpandableCard";
import { diagramHeight, muiDistinctColors } from "./diagramUtils";
import ReactApexChart, { Props as ApexChartProps } from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { grey } from "@mui/material/colors";
import { useSettings } from "../../settings/useSettings";

interface Props {
  data: ReadonlyArray<MavenPluginStats>;
  stats?: GeneralStats;
}

interface DataWithDuration {
  thread: string;
  module: string;
  startTime: Date;
  duration: number;
  lane?: string;
}

export const TimelineCard: FunctionComponent<Props> = ({ data, stats }) => {
  const { settings, setSettings } = useSettings();

  const barData = data.reduce(
    (arr, { thread, module, duration, startTime }) => {
      const existing = arr.find(
        (e) => e.thread === thread && e.module === module,
      );
      if (existing) {
        existing.duration += duration;
        if (startTime < existing.startTime) {
          existing.startTime = startTime;
        }
      } else {
        arr.push({
          thread,
          module,
          startTime,
          duration,
        });
      }
      return arr;
    },
    [] as DataWithDuration[],
  );

  const originalThreads = new Set(barData.map((b) => b.thread));
  const threadInfoAvailable = originalThreads.size > 1;
  const threadInfoMissing = !!stats?.multiThreaded && !threadInfoAvailable;

  if (settings.timelineCompactFlow) {
    barData.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const threadFreeTime: number[] = [];
    const maxThreads = stats?.threads || 100;

    barData.forEach((b) => {
      const start = b.startTime.getTime();
      const end = start + b.duration;
      let threadIdx = threadFreeTime.findIndex((time) => time <= start);

      if (threadIdx === -1) {
        if (threadFreeTime.length < maxThreads) {
          threadIdx = threadFreeTime.length;
        } else {
          threadIdx = 0;
          let minTime = threadFreeTime[0];
          for (let i = 1; i < threadFreeTime.length; i++) {
            if (threadFreeTime[i] < minTime) {
              minTime = threadFreeTime[i];
              threadIdx = i;
            }
          }
        }
      }
      threadFreeTime[threadIdx] = Math.max(threadFreeTime[threadIdx] || 0, end);
      b.lane = `Thread Lane ${threadIdx + 1}`;
    });
  }

  const threads = new Set(barData.map((b) => b.thread));
  const modules = new Set(barData.map((b) => b.module));
  const lanes = new Set(barData.filter((b) => b.lane).map((b) => b.lane!));

  const series: ApexChartProps["series"] = [
    {
      data: barData.map((b, idx) => {
        let axisValue: string;
        if (settings.timelineCompactFlow) {
          axisValue = b.lane || b.thread;
        } else if (threadInfoAvailable) {
          axisValue = b.thread;
        } else {
          axisValue = b.module;
        }

        return {
          fillColor: muiDistinctColors[idx % muiDistinctColors.length],
          x: axisValue,
          y: [
            b.startTime.getTime(),
            new Date(b.startTime.getTime() + b.duration).getTime(),
          ],
        };
      }),
    },
  ];

  const options: ApexOptions = {
    chart: {
      zoom: {
        enabled: false,
      },
      toolbar: {
        show: false,
      },
    },
    fill: {
      opacity: 1.0,
    },
    plotOptions: {
      bar: {
        horizontal: true,
        dataLabels: {
          orientation: "horizontal",
          hideOverflowingLabels: false,
          position: "bottom",
        },
      },
    },
    dataLabels: {
      enabled: settings.timelineShowLabels,
      textAnchor: "start",
      offsetX: -35,
      style: {
        colors: ["black"],
        fontWeight: "normal",
      },
      formatter: function (val, opts) {
        if (!opts) return "";
        const label = barData[opts.dataPointIndex].module;
        if (Array.isArray(val)) {
          const from = new Date(val[0]);
          const to = new Date(val[1]);
          const millis = to.getTime() - from.getTime();
          return `${label} - ${new Date(millis)
            .toISOString()
            .substring(14, 19)}`;
        }
        return label + "";
      },
    },
    xaxis: {
      type: "datetime",
      labels: {
        datetimeUTC: false,
      },
    },
    yaxis: {
      show: true,
    },
    grid: {
      row: {
        colors: [grey[50], "#fff"],
      },
      xaxis: {
        lines: {
          show: true,
        },
      },
      yaxis: {
        lines: {
          show: false,
        },
      },
    },
    states: {
      hover: {
        filter: {
          type: "none",
        },
      },
      active: {
        filter: {
          type: "none",
        },
      },
    },
    tooltip: {
      custom: function (opts) {
        const { dataPointIndex } = opts;
        const data = barData[dataPointIndex];
        const durationStr = new Date(data.duration)
          .toISOString()
          .substring(14, 19);
        return `<div style="padding: 10px;">
          <strong>${data.module}</strong><br/>
          Duration: ${durationStr}<br/>
          Thread: ${data.thread}
        </div>`;
      },
    },
  };

  const rowCount = settings.timelineCompactFlow
    ? lanes.size
    : threadInfoAvailable
      ? threads.size
      : modules.size;

  const height = diagramHeight(rowCount, "normal");

  let subheader =
    "Visualizes execution order and dependencies for multi-module builds. Each line represents a module. In case of multithreaded builds, multiple modules are built concurrently.";
  if (threadInfoMissing) {
    if (settings.timelineCompactFlow) {
      subheader +=
        " Disclaimer: Thread information was missing from the logs, so threads were inferred based on execution times. This is an approximation.";
    } else {
      subheader += " Thread information is missing from the logs.";
    }
  } else {
    subheader += " Only works, if the thread name is part of the log file.";
  }

  return (
    <ExpandableCard expanded={true} title="Timeline" subheader={subheader}>
      <Box sx={{ display: "flex", gap: 2, marginBottom: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={settings.timelineCompactFlow}
              onChange={(e) =>
                setSettings({ timelineCompactFlow: e.target.checked })
              }
            />
          }
          label="Compact Execution Flow"
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.timelineShowLabels}
              onChange={(e) =>
                setSettings({ timelineShowLabels: e.target.checked })
              }
            />
          }
          label="Show labels"
        />
      </Box>
      <ReactApexChart
        options={options}
        series={series}
        type="rangeBar"
        height={height}
      />
      <Box sx={{ overflowX: "auto" }}></Box>
    </ExpandableCard>
  );
};
