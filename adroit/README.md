# Princeton Adroit: big datasets and long training runs

Use Adroit when a study's data is too big for a laptop or the cloud sandbox, or its host is unreachable there. Fitzpatrick17k's atlas images are the current example. The demo never depends on it.

The work is the same training kit as everywhere else (`training/`). Adroit only adds the data and the hours:
- the login node has internet access, so it **downloads**;
- the compute nodes don't, so they **train**.

## One-time setup (login node)

```bash
ssh <netid>@adroit.princeton.edu
mkdir -p /scratch/network/$USER/vf && cd /scratch/network/$USER/vf
git clone https://github.com/carstenmacosko/hackharvard2026.git HackHarvard2026
cd HackHarvard2026 && git checkout claude/hopeful-ritchie-f0dust   # or main once merged

module load anaconda3/2024.6
conda create -n vf-train python=3.12 -y
conda activate vf-train
pip install -r training/requirements.txt
# MediaPipe needs EGL/GLES libraries. If `python -c "import mediapipe"` complains about libEGL:
#   conda install -c conda-forge libegl libgles -y
echo 'export VFCV_CACHE=/scratch/network/$USER/vf-cache' >> ~/.bashrc && export VFCV_CACHE=/scratch/network/$USER/vf-cache
```

Scratch space is not backed up. The cache holds only re-downloadable data.

## Train a study

```bash
# login node: data + models (Fitzpatrick17k ~16.5k images; some atlas links are dead)
bash adroit/fetch_datasets.sh fitzpatrick17k

# compute node: train, evaluate, write the model card
sbatch --export=ALL,STUDY=psoriasis_fitzpatrick17k adroit/train_study.slurm
squeue -u $USER
cat slurm-vf-study-*.out
```

The job writes `training/studies/<study>/model.json`, `metrics.json` and `model_card.md`, and refreshes `packages/shared/src/pretrained/models.json`. Read the model card, then commit **only those files** from the login node and push. Never commit images or the cache.

```bash
git checkout -b adroit/psoriasis-fitzpatrick17k
git add training/studies/psoriasis_fitzpatrick17k packages/shared/src/pretrained/models.json
git commit -m "Train psoriasis_fitzpatrick17k on Adroit" && git push -u origin HEAD
```

If the atlas links are mostly dead, request the full archive from the Fitzpatrick17k authors (form in their README). Unpack it as `$VFCV_CACHE/fitzpatrick17k/images/<md5hash>.jpg` and the loader uses it.

## Optional: fine-tuning a segmentation model (GPU)

`train_segformer.py` / `train_segformer.slurm` fine-tune SegFormer-b0 for background / skin / affected-skin segmentation, to replace the rule-based YCrCb mask in `services/cv/app/modules/eczema.py::skin_mask`. It needs pixel masks, which none of the public datasets above provide. Annotate a few hundred study photos first.

```bash
pip install torch torchvision transformers pillow   # in the vf-train env
# data/images/xxx.jpg + data/masks/xxx.png (0 = background, 1 = skin, 2 = affected skin)
sbatch train_segformer.slurm
```

Never put real participant media on the cluster without the study's approval for that storage.
