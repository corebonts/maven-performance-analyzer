import { dedup, replace } from "../utils/arrayUtils";
import { ifDefinedOrDefault } from "../utils/utils";
import { isValid } from "./dateUtils";
import { ParserResult } from "./parser";

export interface Location {
  readonly startLine: number;
  readonly endLine: number;
}

export interface MavenPluginStats {
  readonly plugin: string;
  readonly module: string;
  readonly startTime: Date;
  readonly duration: number;
  readonly thread: string;
  readonly location?: Location;
}

export interface ModuleStats {
  readonly module: string;
  readonly compiledSources: number;
  readonly compiledTestSources: number;
  readonly copiedResources: number;
  readonly copiedTestResources: number;
}

export interface GeneralStats {
  readonly status: "success" | "failed" | "unknown";
  readonly multiThreaded: boolean;
  readonly threads: number;
  readonly totalBuildTime?: string;
  readonly totalDownloadedBytes: number;
}

export interface TestStats {
  readonly total: number;
  readonly failures: number;
  readonly errors: number;
  readonly skipped: number;
}

export interface AnalyzerMessages {
  readonly info?: string;
  readonly error?: string;
}

export interface ConcurrencyTimeMapEntry {
  readonly startTime: number;
  readonly endTime: number;
  readonly concurrency: number;
}

export interface AnalyzerResult {
  readonly mavenPlugins: ReadonlyArray<MavenPluginStats>;
  readonly modules: ReadonlyArray<ModuleStats>;
  readonly stats?: GeneralStats;
  readonly tests?: TestStats;
  readonly messages: AnalyzerMessages;
  readonly concurrencyTimeMap: ReadonlyArray<ConcurrencyTimeMapEntry>;
}

const MINIMUM_DURATION_IN_MS = 0;

export const analyze = ({
  lines,
  lastTimestamps,
  compiledSources,
  statistics,
  downloads,
  tests,
}: ParserResult): AnalyzerResult => {
  lines.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const aggregatedCompiledSources: ModuleStats[] = compiledSources.reduce(
    (arr, curr) => {
      const existing = arr.find((c) => c.module === curr.module);
      if (existing) {
        let updatedExisting: ModuleStats | undefined;
        if (curr.type === "source") {
          switch (curr.compileMode) {
            case "main":
              updatedExisting = {
                ...existing,
                compiledSources:
                  existing.compiledSources + curr.compiledSources,
              };
              break;
            case "test":
              updatedExisting = {
                ...existing,
                compiledTestSources:
                  existing.compiledTestSources + curr.compiledSources,
              };
              break;
          }
        } else {
          switch (curr.compileMode) {
            case "main":
              updatedExisting = {
                ...existing,
                copiedResources:
                  existing.copiedResources + curr.copiedResources,
              };
              break;
            case "test":
              updatedExisting = {
                ...existing,
                copiedTestResources:
                  existing.copiedTestResources + curr.copiedResources,
              };
              break;
          }
        }
        arr = replace(arr, existing, updatedExisting);
      } else {
        const analyzedModule = {
          module: curr.module,
          compiledSources: 0,
          compiledTestSources: 0,
          copiedResources: 0,
          copiedTestResources: 0,
        };
        if (curr.type === "source") {
          switch (curr.compileMode) {
            case "main":
              analyzedModule.compiledSources = curr.compiledSources;
              break;
            case "test":
              analyzedModule.compiledTestSources = curr.compiledSources;
              break;
          }
        } else {
          switch (curr.compileMode) {
            case "main":
              analyzedModule.copiedResources = curr.copiedResources;
              break;
            case "test":
              analyzedModule.copiedTestResources = curr.copiedResources;
              break;
          }
        }

        arr.push(analyzedModule);
      }
      return arr;
    },
    [] as ModuleStats[],
  );

  const threads = dedup(lines.map((r) => r.thread));
  const mavenPlugins = threads
    .flatMap((thread) => {
      const threadLines = lines.filter(
        (l) => l.thread === undefined || l.thread === thread,
      );
      const lastTimestamp = lastTimestamps.find(
        (t) => t.thread === thread,
      )?.lastTimestamp;
      return threadLines.map(({ module, plugin, startTime }, idx) => {
        const nextLineInSameModule = threadLines
          .slice(idx + 1)
          .find((line) => line.module === module);

        let nextStartTime: Date | undefined;
        if (nextLineInSameModule) {
          nextStartTime = nextLineInSameModule.startTime;
        } else {
          // It's the last plugin for this module in this thread.
          // Use the next line in the thread, regardless of module.
          if (idx < threadLines.length - 1) {
            nextStartTime = threadLines[idx + 1].startTime;
          } else {
            nextStartTime = lastTimestamp;
          }
        }

        return {
          thread: thread || "main",
          module,
          plugin,
          startTime,
          duration:
            nextStartTime && isValid(nextStartTime)
              ? nextStartTime.getTime() - startTime.getTime()
              : 0,
        };
      });
    })
    .filter((p) => p.duration > MINIMUM_DURATION_IN_MS);

  let detectedThreads = statistics.multiThreadedThreads;
  const concurrencyTimeMap: ConcurrencyTimeMapEntry[] = [];
  if (detectedThreads === undefined || detectedThreads === 0) {
    const moduleExecutions: {
      module: string;
      startTime: number;
      endTime: number;
    }[] = [];
    const moduleNames = dedup(mavenPlugins.map((p) => p.module));

    for (const moduleName of moduleNames) {
      const modulePlugins = mavenPlugins.filter((p) => p.module === moduleName);
      if (modulePlugins.length > 0) {
        const startTime = Math.min(
          ...modulePlugins.map((p) => p.startTime.getTime()),
        );
        const endTime = Math.max(
          ...modulePlugins.map((p) => p.startTime.getTime() + p.duration),
        );
        if (endTime > startTime) {
          moduleExecutions.push({ module: moduleName, startTime, endTime });
        }
      }
    }

    if (moduleExecutions.length > 1) {
      const points: { time: number; type: "start" | "end" }[] = [];
      for (const exec of moduleExecutions) {
        points.push({ time: exec.startTime, type: "start" });
        points.push({ time: exec.endTime, type: "end" });
      }

      points.sort((a, b) => {
        if (a.time !== b.time) {
          return a.time - b.time;
        }
        return a.type === "end" ? -1 : 1;
      });

      let concurrentExecutions = 0;
      let maxConcurrentExecutions = 0;
      let lastTime = points.length > 0 ? points[0].time : 0;
      for (const point of points) {
        if (point.time > lastTime && concurrentExecutions > 0) {
          concurrencyTimeMap.push({
            startTime: lastTime,
            endTime: point.time,
            concurrency: concurrentExecutions,
          });
        }
        if (point.type === "start") {
          concurrentExecutions++;
          maxConcurrentExecutions = Math.max(
            maxConcurrentExecutions,
            concurrentExecutions,
          );
        } else {
          concurrentExecutions--;
        }
        lastTime = point.time;
      }
      if (maxConcurrentExecutions > 1) {
        detectedThreads = maxConcurrentExecutions;
      }
    }
  }

  const stats: GeneralStats = {
    multiThreaded: ifDefinedOrDefault(detectedThreads, (t) => t > 1, false),
    threads: ifDefinedOrDefault(detectedThreads, (t) => t, 1),
    status:
      statistics.buildStatus === "success"
        ? "success"
        : statistics.buildStatus === "failed"
          ? "failed"
          : "unknown",
    totalBuildTime: statistics.totalBuildTime,
    totalDownloadedBytes: downloads
      .map((d) => d.sizeInBytes)
      .reduce((prev, curr) => prev + curr, 0),
  };

  const testStats: TestStats = tests.reduce(
    (prev, curr) => {
      prev.errors += curr.errors;
      prev.total += curr.total;
      prev.failures += curr.failures;
      prev.skipped += curr.skipped;
      return prev;
    },
    { errors: 0, failures: 0, skipped: 0, total: 0 } as TestStats,
  );
  return {
    mavenPlugins,
    modules: aggregatedCompiledSources,
    stats,
    tests: testStats,
    messages: determineMessages(mavenPlugins, aggregatedCompiledSources, stats),
    concurrencyTimeMap,
  };
};

const determineMessages = (
  mavenPlugins: MavenPluginStats[],
  modules: ModuleStats[],
  stats: GeneralStats,
): AnalyzerMessages => {
  const noMetricsFound = modules.length === 0 && mavenPlugins.length === 0;
  const multiThreadedNoThreads =
    stats.multiThreaded &&
    stats.threads > 1 &&
    dedup(mavenPlugins.map((p) => p.thread)).length === 1;
  const errorText = noMetricsFound
    ? "No metrics could be found. Please make sure to provide a valid maven log file with timestamp information as described above."
    : undefined;
  const showInfo = modules.length > 0 && mavenPlugins.length === 0;
  let infoText = showInfo
    ? "Durations cannot be calculated. Please make sure that the log file contains timestamps in the expected format yyyy-MM-dd HH:mm:ss,SSS"
    : "";
  if (multiThreadedNoThreads) {
    infoText += ` This seems to be a multi-threaded build with ${stats.threads} threads but the thread name cannot be found in the log file. Please make sure to configure maven logger as described above.`;
  }

  return {
    info: infoText.trim() ? infoText : undefined,
    error: errorText,
  };
};
