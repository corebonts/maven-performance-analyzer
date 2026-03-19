import { FunctionComponent } from "react";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { ExpandableCard } from "./ExpandableCard";
import { MavenPluginStats } from "../../analyzer/analyzer";
import { prettyMs } from "../../utils/utils";

interface Props {
  data: ReadonlyArray<MavenPluginStats>;
}

interface ModuleBuildTime {
  module: string;
  startTime: number;
  endTime: number;
}

export const HeatmapCard: FunctionComponent<Props> = ({ data }) => {
  const moduleBuildTimes = data.reduce((acc, item) => {
    const existing = acc.find((m) => m.module === item.module);
    const endTime = item.startTime.getTime() + item.duration;
    if (existing) {
      if (item.startTime.getTime() < existing.startTime) {
        existing.startTime = item.startTime.getTime();
      }
      if (endTime > existing.endTime) {
        existing.endTime = endTime;
      }
    } else {
      acc.push({
        module: item.module,
        startTime: item.startTime.getTime(),
        endTime,
      });
    }
    return acc;
  }, [] as ModuleBuildTime[]);

  if (moduleBuildTimes.length === 0) {
    return null;
  }

  const minTime = Math.min(...moduleBuildTimes.map((m) => m.startTime));
  const maxTime = Math.max(...moduleBuildTimes.map((m) => m.endTime));
  const totalDuration = maxTime - minTime;
  const numBuckets = 100;
  const bucketWidth = totalDuration / numBuckets;

  const heatmapData = Array.from({ length: numBuckets }).map((_, i) => {
    const bucketStart = minTime + i * bucketWidth;
    const bucketEnd = bucketStart + bucketWidth;
    const overlappingModules = moduleBuildTimes.filter(
      (m) => m.startTime < bucketEnd && m.endTime > bucketStart,
    );
    return {
      x: prettyMs(i * bucketWidth),
      y: overlappingModules.length,
      modules: overlappingModules.map(
        (m) =>
          `${m.module} (${prettyMs(m.startTime - minTime)} - ${prettyMs(
            m.endTime - minTime,
          )})`,
      ),
    };
  });

  const series = [
    {
      name: "Concurrency",
      data: heatmapData,
    },
  ];

  const options: ApexOptions = {
    chart: {
      height: 150,
      type: "heatmap",
      toolbar: {
        show: false,
      },
    },
    plotOptions: {
      heatmap: {
        shadeIntensity: 0.5,
        radius: 0,
        useFillColorAsStroke: true,
        colorScale: {
          ranges: [
            {
              from: 0,
              to: 0,
              name: "0",
              color: "#EEEEEE",
            },
            {
              from: 1,
              to: 2,
              name: "1-2",
              color: "#1E88E5",
            },
            {
              from: 3,
              to: 5,
              name: "3-5",
              color: "#FFB74D",
            },
            {
              from: 6,
              to: 20,
              name: "6-20",
              color: "#D32F2F",
            },
            {
              from: 21,
              to: 100,
              name: ">20",
              color: "#7A0000",
            },
          ],
        },
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      width: 1,
    },
    xaxis: {
      type: "category",
      labels: {
        show: true,
        rotate: -45,
        rotateAlways: false,
        hideOverlappingLabels: true,
        showDuplicates: false,
      },
      tickAmount: 20,
    },
    yaxis: {
      show: false,
    },
    tooltip: {
      custom: function ({ seriesIndex, dataPointIndex, w }) {
        const data = w.globals.initialSeries[seriesIndex].data[dataPointIndex];
        if (data.y === 0) {
          return `<div class="p-2"><strong>Time:</strong> ${data.x}<br/><strong>Concurrency:</strong> 0</div>`;
        }
        return `<div class="p-2">
          <strong>Time:</strong> ${data.x}<br/>
          <strong>Concurrency:</strong> ${data.y}<br/>
          <strong>Modules:</strong><br/>
          <ul>${data.modules.map((m: string) => `<li>${m}</li>`).join("")}</ul>
        </div>`;
      },
    },
  };

  return (
    <ExpandableCard
      title="Concurrency Heatmap"
      subheader="Shows how many modules were being built in parallel over time. Disclaimer: it might not be accurate, as it actually shows all the modules that are built in that period not actual concurrency."
      expanded={true}
    >
      <ReactApexChart
        options={options}
        series={series}
        type="heatmap"
        height={150}
      />
    </ExpandableCard>
  );
};
