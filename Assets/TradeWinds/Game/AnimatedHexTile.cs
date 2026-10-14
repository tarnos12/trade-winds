using UnityEngine;
using UnityEngine.Tilemaps;

namespace TradeWinds.Game
{
    /// <summary>A Tilemap tile that loops a few sprites (water). Built in code by <see cref="BoardView"/>.</summary>
    public sealed class AnimatedHexTile : TileBase
    {
        public Sprite[] Frames;
        public float FramesPerSecond = 2f;
        /// <summary>Offset into the loop, so neighbouring tiles don't move in lockstep.</summary>
        public float StartTime;

        public override void GetTileData(Vector3Int position, ITilemap tilemap, ref TileData tileData)
        {
            tileData.sprite = Frames != null && Frames.Length > 0 ? Frames[0] : null;
            tileData.color = Color.white;
            tileData.flags = TileFlags.LockColor;
            tileData.colliderType = Tile.ColliderType.None;
        }

        public override bool GetTileAnimationData(Vector3Int position, ITilemap tilemap, ref TileAnimationData tileAnimationData)
        {
            if (Frames == null || Frames.Length < 2) return false;
            tileAnimationData.animatedSprites = Frames;
            tileAnimationData.animationSpeed = FramesPerSecond;
            tileAnimationData.animationStartTime = StartTime;
            return true;
        }
    }
}
