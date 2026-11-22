# UTIL UWB TDoA dataset — NO DATA INCLUDED (license not found)

**Status (checked 2026-11-22): blocked. This folder intentionally contains no data files.**
No excerpt of the UTIL dataset was downloaded or redistributed here, because no license
granting redistribution rights could be found for the dataset. Nothing in this folder is
real or synthetic UTIL data; do not treat any file here as a measurement.

요약: UTIL 데이터셋에는 재배포를 허용하는 라이선스가 명시되어 있지 않아, 발췌본을 만들지 않았습니다.
이 폴더에는 데이터 파일이 없습니다 (가짜/합성 데이터도 없음).

## Dataset

- W. Zhao, A. Goudar, X. Qiao, A. P. Schoellig, "UTIL: An Ultra-wideband
  Time-difference-of-arrival Indoor Localization Dataset", *The International Journal of
  Robotics Research*, 43(10), pp. 1443-1456, 2024. arXiv:2203.14471.
- Project page: https://utiasdsl.github.io/util-uwb-dataset/
  (now redirects to https://learnsyslab.github.io/util-uwb-dataset/)
- Repository: https://github.com/utiasDSL/util-uwb-dataset
  (now redirects to https://github.com/learnsyslab/util-uwb-dataset)
- Data file: single release asset
  https://github.com/learnsyslab/util-uwb-dataset/releases/download/dataset-v1.0/dataset.7z
  (1,861,803,968 bytes = 1.86 GB, release `dataset-v1.0`, published 2022-12-01).

## What was checked for a license (all negative)

| Place | Result |
|---|---|
| GitHub API `GET /repos/learnsyslab/util-uwb-dataset/license` | HTTP 404 — GitHub detects no license |
| Repo tree, branch `main` (full recursive listing) | no `LICENSE`/`COPYING`/`NOTICE` file |
| Repo tree, branch `gh-pages` (website source) | no license file; `index.md` has no license/copyright/terms text |
| Commit history for path `LICENSE` | empty (never existed) |
| Repo `README.md` | only a "please use the following citation" request; no license grant |
| `ros_ws/src/cf_msgs/package.xml` | `<license>TODO</license>` |
| Script headers (`scripts/**.py`, `setupscript.bash`) | no license/copyright headers |
| Project page (rendered HTML) | no occurrence of "license", "Creative Commons", "CC BY", "copyright", "redistribut", "terms of use" |
| Release `dataset-v1.0` notes | no license text |
| File listing inside `dataset.7z` (443 files, 135 directories; read from the archive's end header only, ~6 kB via HTTP range requests) | only `.csv`, `.txt` (poses/survey), `.bag`, `.npz` and SD-card binary logs; no LICENSE/README |
| Paper full text (arXiv v5 HTML, ar5iv) | says only "The dataset and development kit are available at ..."; no license statement |
| arXiv record | "arXiv.org perpetual non-exclusive license" — covers arXiv's distribution of the *paper*, not reuse of the dataset |
| GitHub issues (3, all technical) | none about licensing |
| Web search for a stated license / mirror (Zenodo etc.) | nothing found |

Conclusion: the dataset is publicly downloadable and the authors ask for a citation, but
no license (CC, MIT, or otherwise) is stated anywhere. Public availability plus a citation
request is not a redistribution grant, so by default all rights are reserved and bundling
an excerpt in this textbook is not clearly permitted. Not checked: the paywalled SAGE/IJRR
version of record (the arXiv v5 text, dated 2024-01-19, contains no license statement).

## Second, independent blocker

The only data download is one 1.86 GB archive, above the 400 MB download budget set for
this task. (This one is technically solvable — see below — but the license is not.)

## What was downloaded

Only archive *metadata*, kept outside `public/` in `.cache/util/hdr/`:
the 32-byte 7z signature header, the 39-byte end header and the 6,366-byte compressed
file index (decoded to a file listing, CRC verified). **No measurement data was downloaded.**

## How to unblock

1. Ask the authors for written permission (or for a license to be added to the repo) to
   redistribute a small attributed excerpt for educational use. Contacts are listed on the
   project page (first author: Wenda Zhao; PI: Angela P. Schoellig, Learning Systems and
   Robotics Lab, TUM / University of Toronto). Opening a GitHub issue asking for a
   `LICENSE` file is the lightest route.
2. Alternatively, do not bundle the data: link to the dataset from the textbook and let
   readers download it themselves, or show only your own figures/statistics derived from
   it with citation.
3. If permission is obtained, a full 1.86 GB download is not needed. The archive consists
   of 114 independent LZMA2 blocks, so individual blocks can be fetched with HTTP range
   requests:
   - block 105 (file offset 1,519,573,890, 29,487,728 bytes packed, 70.7 MB unpacked)
     holds `identification-dataset/nlos/los-data/los-data_data.csv` + `_pose.txt`, most of
     `nlos/anTag/<material>/dataN/*_data.csv` + `*_pose.txt` and `nlos/anAn/...`
     (materials: cardboard, foam, metal, plastic, wooden-cabinet, wooden-shelf; 6 runs each),
     the LOS `*_pose.txt` files, and `flight-dataset/survey-results/anchor_const{1..4}.npz`
     / `*_survey.txt` (anchor positions);
   - block 78 (offset 943,574,272, 17,455,033 bytes packed) holds the LOS angle-test CSVs
     (`los/angleTest/angleT1..12`, about 0.5 MB each) and `flight-dataset/csv-data/const1/const1-trial1-tdoa2.csv` (31.8 MB);
   - block 104 (offset 1,503,315,808, 16,258,082 bytes packed) holds the LOS distance-test
     CSVs (`los/distTest/distT1..12`).
   Each identification sub-dataset is a `*_data.csv` (TDoA measurement plus SNR / power
   values) with a `*_pose.txt` (Vicon poses of the tag and the two anchors), from which the
   ground-truth TDoA is `||p_tag - p_an2|| - ||p_tag - p_an1||` (verify the sign/anchor
   order against `scripts/identification-dataset/nlos_visual.py` in the repo before use)
   and `err_m = tdoa_meas_m - tdoa_true_m`.
