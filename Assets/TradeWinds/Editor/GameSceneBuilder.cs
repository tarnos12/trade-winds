using System;
using System.Linq;
using TradeWinds.Game;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Tilemaps;
using UnityEngine.UIElements;

namespace TradeWinds.EditorTools
{
    /// <summary>Builds Assets/TradeWinds/Scenes/Game.unity from code so the scene is reproducible.</summary>
    public static class GameSceneBuilder
    {
        public const string ScenePath = "Assets/TradeWinds/Scenes/Game.unity";
        const string ThemePath = "Assets/TradeWinds/UI/TradeWindsTheme.tss";
        const string PanelSettingsPath = "Assets/TradeWinds/UI/GamePanelSettings.asset";
        public const string BalancePath = "Assets/TradeWinds/Data/Balance.asset";

        [MenuItem("Trade Winds/Build Game Scene")]
        public static void Build()
        {
            EnsureFolder("Assets/TradeWinds", "Scenes");
            EnsureFolder("Assets/TradeWinds", "UI");
            EnsurePanelSettings();
            EnsureFolder("Assets/TradeWinds", "Data");
            var balance = EnsureBalance();

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // Camera
            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            var cam = camGo.AddComponent<Camera>();
            cam.orthographic = true;
            cam.orthographicSize = 7f;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Palette.Background;
            camGo.transform.position = new Vector3(0, 0, -10);
            var rig = camGo.AddComponent<CameraRig>();

            // Global 2D light (URP 2D renderer lights sprites).
            var lightGo = new GameObject("Global Light 2D");
            AddGlobalLight2D(lightGo);

            // Hex grid with terrain and road tilemaps.
            var gridGo = new GameObject("Board");
            var grid = gridGo.AddComponent<Grid>();
            grid.cellLayout = GridLayout.CellLayout.Hexagon;
            grid.cellSize = new Vector3(0.8660254f, 1f, 1f);
            var terrain = NewTilemap(gridGo, "Terrain", 0);
            var roads = NewTilemap(gridGo, "Roads", 1);
            var fog = NewTilemap(gridGo, "Fog", 5);

            // Game root: controller, view, HUD.
            var gameGo = new GameObject("Game");
            var view = gameGo.AddComponent<BoardView>();
            view.Grid = grid;
            view.TerrainMap = terrain;
            view.RoadMap = roads;
            view.FogMap = fog;
            var doc = gameGo.AddComponent<UIDocument>();
            doc.panelSettings = AssetDatabase.LoadAssetAtPath<PanelSettings>(PanelSettingsPath);
            if (doc.panelSettings == null) Debug.LogError("[TradeWinds] Panel Settings asset missing at " + PanelSettingsPath);
            var hud = gameGo.AddComponent<Hud>();
            var controller = gameGo.AddComponent<GameController>();
            controller.Board = view;
            controller.CameraRig = rig;
            controller.Hud = hud;
            controller.BalanceAsset = AssetDatabase.LoadAssetAtPath<BalanceAsset>(BalancePath);

            EditorSceneManager.SaveScene(scene, ScenePath);

            var scenes = EditorBuildSettings.scenes.Where(s => s.path != ScenePath).ToList();
            scenes.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
            EditorBuildSettings.scenes = scenes.ToArray();
            Debug.Log("[TradeWinds] Game scene built at " + ScenePath);
        }

        static Tilemap NewTilemap(GameObject grid, string name, int order)
        {
            var go = new GameObject(name);
            go.transform.SetParent(grid.transform, false);
            var map = go.AddComponent<Tilemap>();
            var renderer = go.AddComponent<TilemapRenderer>();
            renderer.sortingOrder = order;
            return map;
        }

        static void AddGlobalLight2D(GameObject go)
        {
            var type = AppDomain.CurrentDomain.GetAssemblies()
                .Select(a => a.GetType("UnityEngine.Rendering.Universal.Light2D"))
                .FirstOrDefault(t => t != null);
            if (type == null)
            {
                Debug.LogWarning("[TradeWinds] Light2D not found; sprites may render dark.");
                return;
            }
            var light = go.AddComponent(type);
            var prop = type.GetProperty("lightType");
            if (prop != null && prop.CanWrite)
                prop.SetValue(light, Enum.Parse(prop.PropertyType, "Global"));
        }

        static PanelSettings EnsurePanelSettings()
        {
            var existing = AssetDatabase.LoadAssetAtPath<PanelSettings>(PanelSettingsPath);
            if (existing != null) return existing;
            AssetDatabase.ImportAsset(ThemePath);
            var theme = AssetDatabase.LoadAssetAtPath<ThemeStyleSheet>(ThemePath);
            var ps = ScriptableObject.CreateInstance<PanelSettings>();
            ps.themeStyleSheet = theme;
            ps.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            ps.referenceResolution = new Vector2Int(1920, 1080);
            ps.match = 0.5f;
            AssetDatabase.CreateAsset(ps, PanelSettingsPath);
            AssetDatabase.SaveAssets();
            return ps;
        }

        public static BalanceAsset EnsureBalance()
        {
            var existing = AssetDatabase.LoadAssetAtPath<BalanceAsset>(BalancePath);
            if (existing != null) return existing;
            var asset = ScriptableObject.CreateInstance<BalanceAsset>();
            AssetDatabase.CreateAsset(asset, BalancePath);
            AssetDatabase.SaveAssets();
            return asset;
        }

        static void EnsureFolder(string parent, string name)
        {
            if (!AssetDatabase.IsValidFolder(parent + "/" + name)) AssetDatabase.CreateFolder(parent, name);
        }
    }
}
