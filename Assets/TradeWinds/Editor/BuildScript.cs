using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace TradeWinds.EditorTools
{
    /// <summary>
    /// Builds a standalone Windows (x64) player containing only the Game scene.
    /// Output folder comes from "-buildOutput &lt;dir&gt;" on the command line, otherwise
    /// &lt;projectRoot&gt;/../trade-winds-builds/TradeWinds-&lt;yyyyMMdd-HHmm&gt;/. In batch mode the
    /// Editor exits with code 0 on success and 1 on failure.
    /// </summary>
    public static class BuildScript
    {
        const string ExeName = "Trade Winds.exe";

        [MenuItem("Trade Winds/Build Windows Player")]
        public static void BuildWindows()
        {
            var outputDir = GetArg("-buildOutput");
            if (string.IsNullOrEmpty(outputDir))
            {
                var projectRoot = Path.GetDirectoryName(Application.dataPath);
                outputDir = Path.Combine(projectRoot, "..", "trade-winds-builds",
                    "TradeWinds-" + DateTime.Now.ToString("yyyyMMdd-HHmm"));
            }
            outputDir = Path.GetFullPath(outputDir);
            Directory.CreateDirectory(outputDir);

            var options = new BuildPlayerOptions
            {
                scenes = new[] { GameSceneBuilder.ScenePath },
                locationPathName = Path.Combine(outputDir, ExeName),
                target = BuildTarget.StandaloneWindows64,
                targetGroup = BuildTargetGroup.Standalone,
                options = BuildOptions.None,
            };

            BuildReport report;
            try
            {
                report = BuildPipeline.BuildPlayer(options);
            }
            catch (Exception e)
            {
                Debug.LogError("[BuildScript] Build threw: " + e);
                Finish(false);
                return;
            }

            var summary = report.summary;
            Debug.Log($"[BuildScript] Result: {summary.result}, total size: {summary.totalSize / (1024f * 1024f):F1} MB, " +
                      $"errors: {summary.totalErrors}, warnings: {summary.totalWarnings}, time: {summary.totalTime}, output: {summary.outputPath}");
            foreach (var step in report.steps)
                foreach (var msg in step.messages.Where(m => m.type == LogType.Error || m.type == LogType.Exception))
                    Debug.LogError($"[BuildScript] {step.name}: {msg.content}");

            Finish(summary.result == BuildResult.Succeeded);
        }

        static void Finish(bool success)
        {
            if (Application.isBatchMode)
                EditorApplication.Exit(success ? 0 : 1);
        }

        static string GetArg(string name)
        {
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
                if (args[i] == name)
                    return args[i + 1];
            return null;
        }
    }
}
