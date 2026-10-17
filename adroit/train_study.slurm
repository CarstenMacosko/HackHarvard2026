#!/bin/bash
# Train one study model on an Adroit compute node (CPU; ridge heads and MediaPipe need no GPU).
# Fetch data first on the login node: bash adroit/fetch_datasets.sh
#
#   sbatch --export=ALL,STUDY=psoriasis_fitzpatrick17k adroit/train_study.slurm
#SBATCH --job-name=vf-study
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=16
#SBATCH --mem=64G
#SBATCH --time=04:00:00
#SBATCH --output=slurm-%x-%j.out

set -euo pipefail
module purge
module load anaconda3/2024.6
conda activate vf-train

: "${STUDY:?set STUDY, e.g. sbatch --export=ALL,STUDY=psoriasis_fitzpatrick17k adroit/train_study.slurm}"
export VFCV_CACHE="${VFCV_CACHE:-/scratch/network/$USER/vf-cache}"
cd "$SLURM_SUBMIT_DIR/training"
python -m vfcv.run "studies/$STUDY" --check
python -m vfcv.run "studies/$STUDY"
echo "done: training/studies/$STUDY/model_card.md"
