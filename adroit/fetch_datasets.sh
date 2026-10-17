#!/bin/bash
# Run on the Adroit LOGIN node (compute nodes have no internet). Downloads the datasets and
# models a study needs into $VFCV_CACHE, so train_study.slurm can run offline.
#
#   cd /scratch/network/$USER/vf/HackHarvard2026 && bash adroit/fetch_datasets.sh [scin] [fitzpatrick17k]
set -euo pipefail
cd "$(dirname "$0")/../training"
export VFCV_CACHE="${VFCV_CACHE:-/scratch/network/$USER/vf-cache}"
mkdir -p "$VFCV_CACHE"
echo "cache: $VFCV_CACHE"

# MediaPipe models (hand landmarker, image embedder): downloaded once into services/cv/models/
python -c "import vfcv.paths; from app.modules.hands import hand_model_path; from app.embedding import embedder_model_path; print(hand_model_path()); print(embedder_model_path())"

datasets=("$@")
if [ ${#datasets[@]} -eq 0 ]; then datasets=(scin fitzpatrick17k); fi
for ds in "${datasets[@]}"; do
  case "$ds" in
    scin) python -m vfcv.datasets.scin --all ;;                 # ~10,400 photos, ~6 GB
    fitzpatrick17k) python -m vfcv.datasets.fitzpatrick17k ;;   # atlas URLs; some links are broken
    *) echo "unknown dataset $ds" >&2; exit 1 ;;
  esac
done
du -sh "$VFCV_CACHE"
