import { Box } from "@mui/material";
import { FunctionComponent, useMemo } from "react";
import { BarDatum, ResponsiveBar } from "@nivo/bar";
import { MavenPluginStats } from "../../analyzer/analyzer";
import { ExpandableCard } from "./ExpandableCard";
import {
  axisWithDuration,
  basicBarCharProps,
  defaultMargin,
  diagramHeight,
  muiDistinctColors,
} from "./diagramUtils";

interface Props {
  data: ReadonlyArray<MavenPluginStats>;
}

interface DataWithDuration extends BarDatum {
  module: string;
  [key: string]: number | string;
  totalDuration: number;
}

export const ModulesCard: FunctionComponent<Props> = ({ data }) => {
  const { barData, keys, modules } = useMemo(() => {
    // Single pass to aggregate everything
    const moduleMap = new Map<string, DataWithDuration>();
    const keySet = new Set<string>();

    for (const d of data) {
      let moduleData = moduleMap.get(d.module);
      if (!moduleData) {
        moduleData = {
          module: d.module,
          totalDuration: 0,
        };
        moduleMap.set(d.module, moduleData);
      }

      const pluginKey = d.plugin;
      const currentDuration = (moduleData[pluginKey] as number) || 0;
      moduleData[pluginKey] = currentDuration + d.duration;
      moduleData.totalDuration += d.duration;
      keySet.add(pluginKey);
    }

    const barDataArray = Array.from(moduleMap.values());
    barDataArray.sort((a, b) => a.totalDuration - b.totalDuration);

    return {
      barData: barDataArray,
      keys: Array.from(keySet).sort(),
      modules: barDataArray.map((d) => d.module),
    };
  }, [data]);

  return (
    <ExpandableCard
      title="Modules"
      subheader="Execution time per module and maven build plugin"
    >
      <Box sx={{ height: `${diagramHeight(modules.length)}px` }}>
        <ResponsiveBar
          {...basicBarCharProps}
          data={barData}
          keys={keys}
          indexBy="module"
          layout="horizontal"
          colors={muiDistinctColors}
          colorBy="id"
          margin={{ ...defaultMargin, right: 220 }}
          enableGridX={false}
          enableGridY={true}
          axisBottom={axisWithDuration}
          legends={[
            {
              dataFrom: "keys",
              anchor: "top-right",
              direction: "column",
              translateX: 120,
              translateY: 0,
              itemsSpacing: 2,
              itemWidth: 100,
              itemHeight: 20,
              toggleSerie: true,
            },
          ]}
        />
      </Box>
    </ExpandableCard>
  );
};
