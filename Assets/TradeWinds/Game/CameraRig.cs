using UnityEngine;
using UnityEngine.InputSystem;

namespace TradeWinds.Game
{
    /// <summary>Orthographic board camera: right/middle-drag pans 1:1, WASD glides, wheel zooms toward the cursor.</summary>
    [RequireComponent(typeof(Camera))]
    public sealed class CameraRig : MonoBehaviour
    {
        public float MinSize = 2.5f;
        public float MaxSize = 16f;
        public float KeyPanSpeed = 1.2f;
        public Rect Bounds = new Rect(-5, -5, 60, 30);

        Camera _cam;
        Vector3 _dragOriginWorld;
        bool _dragging;
        float _targetSize;

        public bool IsDragging => _dragging;

        void Awake()
        {
            _cam = GetComponent<Camera>();
            _cam.orthographic = true;
            _targetSize = _cam.orthographicSize;
        }

        public void CenterOn(Vector3 world)
        {
            transform.position = new Vector3(world.x, world.y, transform.position.z);
        }

        public Vector3 ScreenToWorld(Vector2 screen)
        {
            var p = _cam.ScreenToWorldPoint(new Vector3(screen.x, screen.y, -transform.position.z));
            p.z = 0;
            return p;
        }

        /// <param name="pointerOverUi">Ignore wheel/drag starts over the HUD.</param>
        public void Tick(bool pointerOverUi)
        {
            var mouse = Mouse.current;
            var kb = Keyboard.current;
            if (mouse == null) return;
            Vector2 screen = mouse.position.ReadValue();

            bool dragHeld = mouse.rightButton.isPressed || mouse.middleButton.isPressed;
            if (dragHeld && !_dragging && !pointerOverUi)
            {
                _dragging = true;
                _dragOriginWorld = ScreenToWorld(screen);
            }
            else if (!dragHeld) _dragging = false;

            if (_dragging)
            {
                var now = ScreenToWorld(screen);
                transform.position += _dragOriginWorld - now;
            }

            if (kb != null)
            {
                var dir = Vector2.zero;
                if (kb.wKey.isPressed) dir.y += 1;
                if (kb.sKey.isPressed) dir.y -= 1;
                if (kb.aKey.isPressed) dir.x -= 1;
                if (kb.dKey.isPressed) dir.x += 1;
                transform.position += (Vector3)(dir * (KeyPanSpeed * _cam.orthographicSize * Time.unscaledDeltaTime));
            }

            float scroll = pointerOverUi ? 0 : mouse.scroll.ReadValue().y;
            if (Mathf.Abs(scroll) > 0.01f)
                _targetSize = Mathf.Clamp(_targetSize * (scroll > 0 ? 0.85f : 1.18f), MinSize, MaxSize);

            if (Mathf.Abs(_cam.orthographicSize - _targetSize) > 0.001f)
            {
                var before = ScreenToWorld(screen);
                _cam.orthographicSize = Mathf.Lerp(_cam.orthographicSize, _targetSize, 1 - Mathf.Exp(-14f * Time.unscaledDeltaTime));
                var after = ScreenToWorld(screen);
                if (!pointerOverUi) transform.position += before - after;
            }

            var pos = transform.position;
            pos.x = Mathf.Clamp(pos.x, Bounds.xMin, Bounds.xMax);
            pos.y = Mathf.Clamp(pos.y, Bounds.yMin, Bounds.yMax);
            transform.position = pos;
        }
    }
}
