using System;
using UnityEngine;

namespace Muzikaz.Spatial
{
    public enum SpatialDeviceProfile
    {
        XrealAir2Ultra,
        XrealSixDofCompatible,
        XrealThreeDofDisplay,
        GalaxyS22PhoneAR,
        StandardAndroidFallback,
        Unsupported
    }

    public enum NormalizedHandJoint
    {
        Wrist, Palm,
        ThumbMetacarpal, ThumbProximal, ThumbDistal, ThumbTip,
        IndexMetacarpal, IndexProximal, IndexIntermediate, IndexDistal, IndexTip,
        MiddleMetacarpal, MiddleProximal, MiddleIntermediate, MiddleDistal, MiddleTip,
        RingMetacarpal, RingProximal, RingIntermediate, RingDistal, RingTip,
        LittleMetacarpal, LittleProximal, LittleIntermediate, LittleDistal, LittleTip
    }

    [Serializable]
    public struct TrackedJoint
    {
        public NormalizedHandJoint Joint;
        public Vector3 Position;
        public Quaternion Rotation;
        public float Confidence;
        public Vector3 Velocity;
        public Vector3 AngularVelocity;
        public bool IsTracked;
        public bool IsEstimated;
        public double Timestamp;
    }

    [Serializable]
    public sealed class HandTrackingFrame
    {
        public TrackedJoint[] Left = Array.Empty<TrackedJoint>();
        public TrackedJoint[] Right = Array.Empty<TrackedJoint>();
        public double Timestamp;
    }

    public interface IXrealHandProvider
    {
        bool IsAvailable { get; }
        bool IsRunning { get; }
        int JointCount { get; }
        HandTrackingFrame GetLatestFrame();
        void StartTracking();
        void StopTracking();
    }

    public sealed class NoHandProvider : IXrealHandProvider
    {
        private static readonly HandTrackingFrame EmptyFrame = new HandTrackingFrame();
        public bool IsAvailable => false;
        public bool IsRunning => false;
        public int JointCount => 0;
        public HandTrackingFrame GetLatestFrame() => EmptyFrame;
        public void StartTracking() { }
        public void StopTracking() { }
    }

    [Serializable]
    public sealed class HandCalibrationProfile
    {
        public float LeftOpenPinchDistance;
        public float LeftClosedPinchDistance;
        public float RightOpenPinchDistance;
        public float RightClosedPinchDistance;
        public float ComfortableNearDistance;
        public float ComfortableFarDistance;
        public float HandRayOffset;
        public float HandScale = 1f;
        public bool IsLeftHandDominant;
    }
}
