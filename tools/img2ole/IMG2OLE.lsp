;;; ===========================================================================
;;; IMG2OLE.lsp  -  Replace linked pictures in DWG files with embedded pictures
;;; ---------------------------------------------------------------------------
;;; Why:  Revit's standard DWG export keeps logos/stamps as LINKED images
;;;       (separate PNG files next to the DWG). DiRoots embeds them as OLE
;;;       "Picture (Enhanced Metafile)" objects. This tool does the same.
;;;
;;; Commands (full AutoCAD):
;;;   IMG2OLE1  - current drawing only (use this for the first test)
;;;   IMG2OLE   - many drawings: a folder, or a list file of DWG paths
;;;
;;; Modes:
;;;   Dryrun - reports what it WOULD change. Changes nothing.
;;;   Run    - replaces the pictures. Batch mode works on COPIES only.
;;;
;;; Headless dry run (AI team / no AutoCAD window):
;;;   Invoke-Img2OleDryRun.ps1 runs (i2o:process-file "DRYRUN" ...) in
;;;   AutoCAD Core Console. The dry-run code below uses plain AutoLISP only.
;;;
;;; Logs (CSV, open in Excel), written to the output folder:
;;;   IMG2OLE_images.csv - one row per picture
;;;   IMG2OLE_files.csv  - one row per drawing
;;; ===========================================================================

(if vl-load-com (vl-load-com))

(setq i2o:*img-header*
  "Timestamp,Mode,File,Container,Handle,Layer,ImageName,ImagePath,PictureFile,X,Y,Width,Height,RotationDeg,Status,Note")
(setq i2o:*file-header*
  "Timestamp,Mode,File,ImagesFound,Ready,Replaced,Skipped,Failed,Result,Message")

;;; ---------------------------------------------------------------- helpers --

(defun i2o:get (k r) (cdr (assoc k r)))

(defun i2o:3d (p) (if (= 2 (length p)) (append p '(0.0)) p))

(defun i2o:len (v) (sqrt (+ (* (car v) (car v)) (* (cadr v) (cadr v)) (* (caddr v) (caddr v)))))

;; folder path with backslashes and one trailing backslash
(defun i2o:dir (d)
  (setq d (vl-string-translate "/" "\\" d))
  (if (/= (substr d (strlen d)) "\\") (strcat d "\\") d))

;; path with forward slashes (safe inside LISP strings in a script)
(defun i2o:fwd (p) (vl-string-translate "\\" "/" p))

(defun i2o:abs-p (p) (or (wcmatch p "?:*") (wcmatch p "\\\\*")))

(defun i2o:replace-all (s old new / i)
  (setq i 0)
  (while (setq i (vl-string-search old s i))
    (setq s (strcat (substr s 1 i) new (substr s (+ i 1 (strlen old))))
          i (+ i (strlen new))))
  s)

(defun i2o:s (x)
  (cond ((null x) "")
        ((= (type x) 'STR) x)
        ((= (type x) 'REAL) (rtos x 2 4))
        ((= (type x) 'INT) (itoa x))
        (T (vl-princ-to-string x))))

(defun i2o:q (x) (strcat "\"" (i2o:replace-all (i2o:s x) "\"" "\"\"") "\""))

(defun i2o:csv (lst)
  (apply 'strcat (cons (car lst) (mapcar '(lambda (x) (strcat "," x)) (cdr lst)))))

(defun i2o:append (path header line / new f)
  (setq new (not (findfile path)))
  (if (setq f (open path "a"))
    (progn (if new (write-line header f)) (write-line line f) (close f) T)))

;; "2026-11-22 14:30:05" from CDATE (works in Core Console too)
(defun i2o:stamp (/ s d f p)
  (setq s (rtos (getvar "CDATE") 2 6)
        p (vl-string-search "." s)
        d (if p (substr s 1 p) s)
        f (if p (substr s (+ p 2)) ""))
  (while (< (strlen f) 6) (setq f (strcat f "0")))
  (strcat (substr d 1 4) "-" (substr d 5 2) "-" (substr d 7 2) " "
          (substr f 1 2) ":" (substr f 3 2) ":" (substr f 5 2)))

;; T when running in full AutoCAD (ActiveX available), nil in Core Console
(defun i2o:com-p ()
  (and vlax-get-acad-object
       (not (vl-catch-all-error-p (vl-catch-all-apply 'vlax-get-acad-object nil)))))

;; folder that holds IMG2OLE.lsp (no prompts)
(defun i2o:home-quiet (/ p)
  (cond ((setq p (findfile "IMG2OLE.lsp")) (vl-filename-directory p))
        ((and (setq p (getenv "IMG2OLE_HOME")) (findfile (strcat p "\\IMG2OLE.lsp"))) p)))

;; same, but asks once if it cannot find it, and remembers the answer
(defun i2o:home (/ p)
  (cond ((setq p (i2o:home-quiet)) (setenv "IMG2OLE_HOME" p) p)
        ((setq p (getfiled "Where is IMG2OLE.lsp?" "" "lsp" 0))
         (setq p (vl-filename-directory p))
         (setenv "IMG2OLE_HOME" p)
         p)))

;;; -------------------------------------------------------- find pictures --

;; alist (imagedef-ename . image name) from the image dictionary
(defun i2o:imagedef-names (/ d nm res)
  (if (setq d (dictsearch (namedobjdict) "ACAD_IMAGE_DICT"))
    (foreach p d
      (cond ((= (car p) 3) (setq nm (cdr p)))
            ((and nm (member (car p) '(350 360)))
             (setq res (cons (cons (cdr p) nm) res) nm nil)))))
  res)

;; readable name of the space/block that holds the picture
(defun i2o:container-name (owner / ed nm lay)
  (setq ed (entget owner) nm (cdr (assoc 2 ed)))
  (cond ((null nm) "?")
        ((= (strcase nm) "*MODEL_SPACE") "Model")
        ((and (wcmatch (strcase nm) "`*PAPER_SPACE*") (setq lay (cdr (assoc 340 ed))))
         (strcat "Layout: " (cdr (assoc 1 (entget lay)))))
        (T (strcat "Block: " nm))))

;; find the real picture file: stored path, then next to the DWG, then source folder
(defun i2o:resolve (p srcdir / nm pre cands)
  (setq nm  (strcat (vl-filename-base p) (cond ((vl-filename-extension p)) ("")))
        pre (getvar "DWGPREFIX")
        cands (list p (strcat pre p) (strcat pre nm)))
  (if srcdir
    (setq cands (append cands (list (strcat (i2o:dir srcdir) p) (strcat (i2o:dir srcdir) nm)))))
  (vl-some '(lambda (c) (if (i2o:abs-p c) (findfile c))) cands))

;; T when the picture is cropped (a clip that is smaller than the full picture)
(defun i2o:clipped-p (ed su sv / verts typ a b)
  (if (= 1 (cdr (assoc 280 ed)))
    (progn
      (setq typ   (cdr (assoc 71 ed))
            verts (mapcar 'cdr (vl-remove-if-not '(lambda (p) (= 14 (car p))) ed)))
      (not (and (= typ 1)
                (= 2 (length verts))
                (setq a (car verts) b (cadr verts))
                (equal (car a) -0.5 0.01) (equal (cadr a) -0.5 0.01)
                (equal (car b) (- su 0.5) 0.01) (equal (cadr b) (- sv 0.5) 0.01))))))

;; one record per picture
(defun i2o:describe (e names srcdir / ed ins u v sz su sv def path png lu lv w h rot cross dot owner prob)
  (setq ed    (entget e)
        ins   (i2o:3d (cdr (assoc 10 ed)))
        u     (i2o:3d (cdr (assoc 11 ed)))
        v     (i2o:3d (cdr (assoc 12 ed)))
        sz    (cdr (assoc 13 ed))
        su    (if sz (car sz) 0.0)
        sv    (if sz (cadr sz) 0.0)
        def   (cdr (assoc 340 ed))
        owner (cdr (assoc 330 ed))
        lu    (i2o:len u)
        lv    (i2o:len v)
        w     (* lu su)
        h     (* lv sv)
        rot   (if (> lu 0.0) (atan (cadr u) (car u)) 0.0)
        cross (- (* (car u) (cadr v)) (* (cadr u) (car v)))
        dot   (+ (* (car u) (car v)) (* (cadr u) (cadr v)) (* (caddr u) (caddr v))))
  (if def (setq path (cdr (assoc 1 (entget def)))))
  (if path (setq png (i2o:resolve path srcdir)))
  (setq prob
    (cond ((null def)  "Image has no definition")
          ((or (null path) (= path "")) "Image definition has no file path")
          ((or (<= w 0.0) (<= h 0.0)) "Image has zero size")
          ((or (> (abs (caddr u)) 1e-9) (> (abs (caddr v)) 1e-9)) "Image is tilted in 3D")
          ((< cross 0.0) "Image is mirrored")
          ((> (abs dot) (* 1e-6 lu lv)) "Image is skewed")
          ((i2o:clipped-p ed su sv) "Image is clipped (cropped)")
          ((null png) "Picture file not found")
          ((not (wcmatch (strcase png) "*.PNG,*.JPG,*.JPEG,*.BMP,*.GIF,*.TIF,*.TIFF"))
           "Picture file type not supported")))
  (list (cons 'ename e)
        (cons 'handle (cdr (assoc 5 ed)))
        (cons 'layer (cdr (assoc 8 ed)))
        (cons 'owner owner)
        (cons 'container (if owner (i2o:container-name owner) "?"))
        (cons 'def def)
        (cons 'name (cdr (assoc def names)))
        (cons 'path path)
        (cons 'png png)
        (cons 'origin ins)
        (cons 'w w)
        (cons 'h h)
        (cons 'rot rot)
        (cons 'problem prob)))

(defun i2o:-add (e / h)
  (setq h (cdr (assoc 5 (entget e))))
  (if (not (member h i2o:-seen))
    (setq i2o:-seen (cons h i2o:-seen)
          i2o:-res  (cons (i2o:describe e i2o:-names i2o:-src) i2o:-res))))

;; every picture in the drawing: model space, all layouts, all block definitions
;; (nested blocks too). Xref blocks are skipped: their own DWG gets processed.
(defun i2o:collect (srcdir / i2o:-seen i2o:-res i2o:-names i2o:-src ss i e blk)
  (setq i2o:-names (i2o:imagedef-names) i2o:-src srcdir)
  (if (setq ss (ssget "_X" '((0 . "IMAGE"))))
    (repeat (setq i (sslength ss))
      (i2o:-add (ssname ss (setq i (1- i))))))
  (setq blk (tblnext "BLOCK" T))
  (while blk
    (if (zerop (logand 44 (cond ((cdr (assoc 70 blk))) (0))))   ; 4 xref, 8 overlay, 32 xref-dependent
      (progn
        (setq e (tblobjname "BLOCK" (cdr (assoc 2 blk))))
        (while (setq e (entnext e))
          (if (= "IMAGE" (cdr (assoc 0 (entget e)))) (i2o:-add e)))))
    (setq blk (tblnext "BLOCK")))
  (reverse i2o:-res))

;;; --------------------------------------------------- replace (full CAD) --

(defun i2o:helper (name / home p)
  (if (and (setq home (i2o:home-quiet)) (setq p (findfile (strcat home "\\" name)))) p))

;; put the picture on the Windows clipboard (EMF like DiRoots, or DIB bitmap)
(defun i2o:clip (png fmt / ps wsh rc)
  (if (setq ps (i2o:helper "IMG2OLE_clip.ps1"))
    (progn
      (setq wsh (vlax-create-object "WScript.Shell")
            rc  (vl-catch-all-apply 'vlax-invoke
                  (list wsh 'Run
                        (strcat "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -STA -File \""
                                ps "\" -Path \"" png "\" -Format " fmt)
                        0 :vlax-true)))
      (vlax-release-object wsh)
      (and (not (vl-catch-all-error-p rc)) (eq rc 0)))))

;; paste the clipboard picture into model space; returns the new OLE ename or nil
(defun i2o:paste (pt / before e n)
  (setq before (entlast) n 0)
  (command "_.PASTECLIP")
  (while (and (> (getvar "CMDACTIVE") 0) (< n 4))
    (command "_non" (list (car pt) (cadr pt)))
    (setq n (1+ n)))
  (setq e (entlast))
  (cond ((or (null e) (equal e before)) nil)
        ((= "OLE2FRAME" (cdr (assoc 0 (entget e)))) e)
        (T (entdel e) nil)))

;; size and place an OLE so it covers exactly the old picture
(defun i2o:fit (o org w h rot / ll ur e)
  (vl-catch-all-apply 'vla-put-LockAspectRatio (list o :vlax-false))
  (vl-catch-all-apply 'vla-put-Rotation (list o 0.0))
  (vla-put-Width o w)
  (vla-put-Height o h)
  (setq e (vl-catch-all-apply 'vla-GetBoundingBox (list o 'll 'ur)))
  (if (vl-catch-all-error-p e)
    (setq ll (mapcar '- (vlax-get o 'InsertionPoint) (list 0.0 h 0.0)))   ; OLE insertion = top-left
    (setq ll (vlax-safearray->list ll)))
  (vla-Move o (vlax-3d-point ll) (vlax-3d-point org))
  (if (> (abs rot) 1e-9) (vla-Rotate o (vlax-3d-point org) rot)))

;; put the new OLE in the same draw-order spot as the old picture
(defun i2o:draworder (blk new img / xd st)
  (setq xd (vla-GetExtensionDictionary blk)
        st (vl-catch-all-apply 'vla-GetObject (list xd "ACAD_SORTENTS")))
  (if (vl-catch-all-error-p st)
    (setq st (vla-AddObject xd "ACAD_SORTENTS" "AcDbSortentsTable")))
  (vlax-invoke st 'MoveAbove (list new) img))

(defun i2o:check (o r / ll ur e org tol)
  (setq e   (vl-catch-all-apply 'vla-GetBoundingBox (list o 'll 'ur))
        tol (max 0.01 (* 0.001 (max (i2o:get 'w r) (i2o:get 'h r)))))
  (cond ((vl-catch-all-error-p e) "Placed (could not measure it)")
        ((> (abs (i2o:get 'rot r)) 1e-9) "Placed with rotation - check visually")
        (T (setq ll (vlax-safearray->list ll) ur (vlax-safearray->list ur) org (i2o:get 'origin r))
           (if (and (equal (car ll) (car org) tol) (equal (cadr ll) (cadr org) tol)
                    (equal (- (car ur) (car ll)) (i2o:get 'w r) tol)
                    (equal (- (cadr ur) (cadr ll)) (i2o:get 'h r) tol))
             "Position and size match"
             "Placed, but size or position differs - check visually"))))

(defun i2o:replace-one (doc master r / blk copy img err)
  (setq err
    (vl-catch-all-apply
      '(lambda ()
         (setq blk  (vlax-ename->vla-object (i2o:get 'owner r))
               copy (car (vlax-invoke doc 'CopyObjects (list master) blk)))
         (i2o:fit copy (i2o:get 'origin r) (i2o:get 'w r) (i2o:get 'h r) (i2o:get 'rot r))
         (vla-put-Layer copy (i2o:get 'layer r))
         (vl-catch-all-apply 'vla-put-OlePlotQuality (list copy 2))   ; High graphics
         (setq img (vlax-ename->vla-object (i2o:get 'ename r)))
         (vl-catch-all-apply 'i2o:draworder (list blk copy img))
         (vla-Delete img))))
  (if (vl-catch-all-error-p err)
    (progn
      (if copy (vl-catch-all-apply 'vla-Delete (list copy)))
      (list r "FAILED" (vl-catch-all-error-message err)))
    (list r "REPLACED" (i2o:check copy r))))

;; remove image definitions (links) that no picture uses any more
(defun i2o:remove-unused-defs (res / defs used dict)
  (foreach x res
    (if (= (cadr x) "REPLACED")
      (setq defs (cons (cons (i2o:get 'def (car x)) (i2o:get 'name (car x))) defs))))
  (foreach r (i2o:collect nil) (setq used (cons (i2o:get 'def r) used)))
  (setq dict (cdr (assoc -1 (dictsearch (namedobjdict) "ACAD_IMAGE_DICT"))))
  (foreach d defs
    (if (and dict (car d) (cdr d) (not (member (car d) used)) (dictsearch dict (cdr d)))
      (vl-catch-all-apply
        '(lambda () (dictremove dict (cdr d)) (entdel (car d)))))))

(defun i2o:run (recs fmt / doc groups g png m mo res oldctab oldecho)
  (setq doc     (vla-get-ActiveDocument (vlax-get-acad-object))
        oldecho (getvar "CMDECHO")
        oldctab (getvar "CTAB"))
  (vla-StartUndoMark doc)
  (setvar "CMDECHO" 0)
  (if (/= (strcase oldctab) "MODEL") (setvar "CTAB" "Model"))
  ;; group by picture file: one clipboard + one paste per picture file
  (foreach r recs
    (if (not (i2o:get 'problem r))
      (progn
        (setq png (strcase (i2o:get 'png r)))
        (if (setq g (assoc png groups))
          (setq groups (subst (append g (list r)) g groups))
          (setq groups (append groups (list (list png r))))))))
  (foreach g groups
    (cond
      ((not (i2o:clip (i2o:get 'png (cadr g)) fmt))
       (foreach r (cdr g)
         (setq res (cons (list r "FAILED" "Could not put the picture on the clipboard (is PowerShell blocked?)") res))))
      ((not (setq m (i2o:paste (i2o:get 'origin (cadr g)))))
       (foreach r (cdr g)
         (setq res (cons (list r "FAILED" "PASTECLIP did not create an OLE object") res))))
      (T
       (setq mo (vlax-ename->vla-object m))
       (foreach r (cdr g) (setq res (cons (i2o:replace-one doc mo r) res)))
       (vl-catch-all-apply 'vla-Delete (list mo)))))
  (i2o:remove-unused-defs res)
  (vl-catch-all-apply 'setvar (list "CTAB" oldctab))
  (setvar "CMDECHO" oldecho)
  (vla-Regen doc 1)
  (vla-EndUndoMark doc)
  (reverse res))

;;; ------------------------------------------------------ one drawing --

(defun i2o:log-image (outdir mode file r status note / o)
  (setq o (i2o:get 'origin r))
  (i2o:append (strcat outdir "IMG2OLE_images.csv") i2o:*img-header*
    (i2o:csv (mapcar 'i2o:q
      (list (i2o:stamp) mode file (i2o:get 'container r) (i2o:get 'handle r) (i2o:get 'layer r)
            (i2o:get 'name r) (i2o:get 'path r) (i2o:get 'png r)
            (car o) (cadr o) (i2o:get 'w r) (i2o:get 'h r)
            (* 180.0 (/ (i2o:get 'rot r) pi)) status note)))))

;; MAIN ENTRY used by scripts and Core Console.
;;   mode   "DRYRUN" or "RUN"
;;   srcdir folder with the original DWG + picture files (or nil)
;;   outdir folder for the CSV logs
;;   fmt    "EMF" (like DiRoots) or "DIB"
(defun i2o:process-file (mode srcdir outdir fmt / file recs res nfound nready nrep nskip nfail result msg)
  (setq mode   (strcase mode)
        outdir (i2o:dir outdir)
        srcdir (if srcdir (i2o:dir srcdir))
        fmt    (if (= (strcase (cond (fmt) (""))) "DIB") "DIB" "EMF")
        file   (strcat (getvar "DWGPREFIX") (getvar "DWGNAME"))
        recs   (i2o:collect srcdir)
        nfound (length recs) nready 0 nrep 0 nskip 0 nfail 0 msg "")
  (foreach r recs
    (if (i2o:get 'problem r) (setq nskip (1+ nskip)) (setq nready (1+ nready))))
  (cond
    ((= mode "DRYRUN")
     (foreach r recs
       (i2o:log-image outdir mode file r
         (if (i2o:get 'problem r) "WOULD_SKIP" "WOULD_REPLACE")
         (cond ((i2o:get 'problem r)) (""))))
     (setq result (cond ((= nfound 0) "NO_IMAGES") ((> nskip 0) "CHECK") ("OK"))))
    ((not (i2o:com-p))
     (setq result "FAILED" msg "Run mode needs full AutoCAD (not Core Console)"))
    (T
     (foreach r recs
       (if (i2o:get 'problem r)
         (i2o:log-image outdir mode file r "SKIPPED" (i2o:get 'problem r))))
     (setq res (if (> nready 0) (i2o:run recs fmt)))
     (foreach x res
       (i2o:log-image outdir mode file (car x) (cadr x) (caddr x))
       (if (= (cadr x) "REPLACED") (setq nrep (1+ nrep)) (setq nfail (1+ nfail))))
     (setq result (cond ((= nfound 0) "NO_IMAGES")
                        ((and (= nfail 0) (= nskip 0)) "OK")
                        ((> nrep 0) "PARTIAL")
                        ("FAILED")))))
  (i2o:append (strcat outdir "IMG2OLE_files.csv") i2o:*file-header*
    (i2o:csv (mapcar 'i2o:q (list (i2o:stamp) mode file nfound nready nrep nskip nfail result msg))))
  (princ (strcat "\nIMG2OLE " mode ": " (getvar "DWGNAME")
                 "  pictures " (itoa nfound) ", ready " (itoa nready)
                 (if (= mode "RUN") (strcat ", replaced " (itoa nrep) ", failed " (itoa nfail)) "")
                 ", skipped " (itoa nskip) "  -> " result))
  (princ))

;;; ------------------------------------------------------------ commands --

(defun i2o:ask-mode (/ k)
  (initget "Dryrun Run")
  (setq k (getkword "\nMode [Dryrun/Run] <Dryrun>: "))
  (if (= k "Run") "RUN" "DRYRUN"))

(defun i2o:ask-format (/ k)
  (princ "\nEmf = same as DiRoots (Picture Enhanced Metafile). Dib = plain bitmap.")
  (initget "Emf Dib")
  (setq k (getkword "\nPicture type [Emf/Dib] <Emf>: "))
  (if (= k "Dib") "DIB" "EMF"))

;; current drawing only - logs go next to the drawing
(defun c:IMG2OLE1 (/ mode fmt dir)
  (setq mode (i2o:ask-mode))
  (cond
    ((and (= mode "RUN") (not (i2o:com-p)))
     (princ "\nRun mode needs full AutoCAD."))
    ((and (= mode "RUN") (null (i2o:home)))
     (princ "\nCannot find the IMG2OLE folder."))
    (T
     (setq fmt (if (= mode "RUN") (i2o:ask-format) "EMF")
           dir (getvar "DWGPREFIX"))
     (i2o:process-file mode dir dir fmt)
     (princ (strcat "\nLogs: " (i2o:dir dir) "IMG2OLE_images.csv"))
     (if (= mode "RUN") (princ "\nNot saved yet: check the result, then SAVE (or UNDO to go back)."))))
  (princ))

(defun i2o:browse (msg / sh f p)
  (setq sh (vlax-get-or-create-object "Shell.Application")
        f  (vl-catch-all-apply 'vlax-invoke-method (list sh 'BrowseForFolder 0 msg 0)))
  (if (and f (not (vl-catch-all-error-p f)))
    (setq p (vl-catch-all-apply
              '(lambda () (vlax-get-property (vlax-get-property f 'Self) 'Path)))))
  (vlax-release-object sh)
  (if (and p (= (type p) 'STR) (vl-file-directory-p p)) (i2o:dir p)))

;; list file: one DWG path per line (first column if it is a CSV)
(defun i2o:read-list (lf / f l p i res)
  (setq f (open lf "r"))
  (while (setq l (read-line f))
    (setq p (if (setq i (vl-string-search "," l)) (substr l 1 i) l)
          p (vl-string-trim " \t\"" p))
    (cond ((not (wcmatch (strcase p) "*.DWG")))
          ((findfile p) (setq res (cons p res)))
          (T (princ (strcat "\n  Not found, skipped: " p)))))
  (close f)
  (reverse res))

;; many drawings
(defun c:IMG2OLE (/ home mode fmt how src lf files outdir work scr f dest names lsp fd n copies)
  (cond
    ((not (i2o:com-p)) (princ "\nIMG2OLE needs full AutoCAD."))
    ((null (setq home (i2o:home))) (princ "\nCannot find the IMG2OLE folder."))
    (T
     (setq mode (i2o:ask-mode)
           fmt  (if (= mode "RUN") (i2o:ask-format) "EMF"))
     (initget "Folder List")
     (setq how (cond ((getkword "\nPick drawings by [Folder/List] <Folder>: ")) ("Folder")))
     (if (= how "Folder")
       (if (setq src (i2o:browse "Folder with the exported DWG files"))
         (setq files (mapcar '(lambda (n) (strcat src n)) (vl-directory-files src "*.dwg" 1))))
       (if (setq lf (getfiled "List of DWG files (one path per line)" "" "txt;csv" 0))
         (setq src (i2o:dir (vl-filename-directory lf)) files (i2o:read-list lf))))
     (cond
       ((null files) (princ "\nNo DWG files found. Nothing done."))
       (T
        (setq outdir (strcat src "IMG2OLE_processed\\")
              f      (getstring T (strcat "\nOutput folder <" outdir ">: ")))
        (if (/= f "") (setq outdir (i2o:dir f)))
        (if (not (vl-file-directory-p outdir)) (vl-mkdir (vl-string-right-trim "\\" outdir)))
        (setq work (if (= mode "RUN") outdir (strcat outdir "_dryrun_temp\\")))
        (if (not (vl-file-directory-p work)) (vl-mkdir (vl-string-right-trim "\\" work)))
        (cond
          ((not (vl-file-directory-p work)) (princ (strcat "\nCannot create folder: " work)))
          (T
           ;; copy originals: the batch only ever opens and saves the copies
           (foreach f files
             (setq dest (strcat work (vl-filename-base f) ".dwg"))
             (cond
               ((member (strcase dest) names)
                (princ (strcat "\n  Same file name twice, skipped: " f)))
               ((= (strcase dest) (strcase f))
                (princ (strcat "\n  Output is the same as the original, skipped: " f)))
               (T
                (if (findfile dest) (vl-file-delete dest))
                (if (vl-file-copy f dest)
                  (setq names  (cons (strcase dest) names)
                        copies (cons (list dest (vl-filename-directory f)) copies))
                  (princ (strcat "\n  Could not copy, skipped: " f))))))
           (setq copies (reverse copies)
                 lsp    (i2o:fwd (strcat home "\\IMG2OLE.lsp"))
                 scr    (strcat outdir "IMG2OLE_batch.scr")
                 fd     (getvar "FILEDIA")
                 f      (open scr "w"))
           (foreach c copies
             (write-line (strcat "_.OPEN \"" (car c) "\"") f)
             (write-line (strcat "(load \"" lsp "\")") f)
             (write-line (strcat "(i2o:process-file \"" mode "\" \"" (i2o:fwd (cadr c))
                                 "/\" \"" (i2o:fwd outdir) "\" \"" fmt "\")") f)
             (write-line "_.QSAVE" f)
             (write-line "_.CLOSE" f))
           (write-line (strcat "(i2o:finish \"" (i2o:fwd outdir) "\" \"" mode "\" " (itoa fd) ")") f)
           (close f)
           (princ (strcat "\n" (itoa (length copies)) " drawing(s) queued. Mode: " mode
                          "\nPlease do not use AutoCAD until it says 'IMG2OLE finished'."))
           (setvar "FILEDIA" 0)
           (command "_.SCRIPT" scr)))))))
  (princ))

;; last line of the batch script
(defun i2o:finish (outdir mode fd / tmp)
  (setvar "FILEDIA" fd)
  (setq outdir (i2o:dir outdir))
  (if (= (strcase mode) "DRYRUN")
    (progn
      (setq tmp (strcat outdir "_dryrun_temp\\"))
      (foreach pat '("*.dwg" "*.bak" "*.dwl" "*.dwl2")
        (foreach f (vl-directory-files tmp pat 1) (vl-file-delete (strcat tmp f))))))
  (princ (strcat "\nIMG2OLE finished (" mode "). Logs: " outdir "IMG2OLE_files.csv and IMG2OLE_images.csv"))
  (princ))

(princ "\nIMG2OLE loaded. Commands: IMG2OLE1 (this drawing), IMG2OLE (many drawings).")
(princ)
