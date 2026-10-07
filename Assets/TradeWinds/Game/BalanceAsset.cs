using TradeWinds.Core;
using UnityEngine;

namespace TradeWinds.Game
{
    /// <summary>Inspector-editable balance numbers (ADR 0002). The game copies them into plain core data at
    /// the start of each realm, so editing the asset never touches a running simulation.</summary>
    [CreateAssetMenu(menuName = "Trade Winds/Balance", fileName = "Balance")]
    public sealed class BalanceAsset : ScriptableObject
    {
        public Balance Balance = new Balance();

        /// <summary>A detached copy for the core.</summary>
        public Balance CreateCopy() => JsonUtility.FromJson<Balance>(JsonUtility.ToJson(Balance));
    }
}
