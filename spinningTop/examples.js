// https://github.com/ioccc-src/winner/tree/master/2024/endoh2

const top = String.raw`
.
.
.
.
.
.
...
   #####
        ##
          #
        ##
   #####
 ##
#
#
#`;

const top2 = String.raw`
#
#
#
#
#
#
###############
              #
              #
         #####
    #####
####
#
#`;

const top3 = String.raw`
#
#
#
#
#####
     ##
       #
       #
       #
       #
       #
      # 
     #
   ##
 ##
#`;

const top4 = String.raw`
#
#
#
#
#
#
###############
           ##
         ##
       ##
     ##
   ##
 ##
#`;

const tippeTop = String.raw`
 .
 .
 .
 .
 .
 .
 .         ..
 .           .
 .            .
 .            .
 .            .
 .            .
.#.#.#.#.#.#.#
#.#.#.#.#.#.#
.#.#.#.#.#.
#.#.#.#.`;

const tippeTop2 = String.raw`
..
. 
. 
. 
. 
. 
. 
. 
. 
. 
. 
.
.
.             .
.             .
.             .
.             .
.#.#.#.#.#.#.#
#.#.#.#.#.#.# 
.#.#.#.#.#.
#.#.#.#.`;

const tippeTop3 = String.raw`
   #
   .
   .
   .
   .
   .
   .
   .
   .
   .          #.
   .          .#
   .          #.
   .          .#
   .          #.
   .          .#
   .        #.# 
 #.#.#.#.#.#.# 
 .#.#.#.#.#. 
 #.#.#.#`;

const bottle = String.raw`
#
#
#
#
 ##
   #
    #
    #
    #
    #
    #
    #
    #
    #
    #
#####`;

const umbrella = String.raw`
########
#       ###
#          ##
#            ##
#              #
#               #
#
#
#
#
#
#
#
#
#`;

const vase = String.raw`
      ...
     .
    .
    .
     ..
       ..
         #
          #
          #
          #
         #
        #
      ##
######`;

const egg = String.raw`
###
   ##
     #
      #
       #
       #
        #
        #
        #
        #
        #
       #
     ## 
#####`;

const stick = String.raw`
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#`;

const cylinder = String.raw`
...............
              .
              .
              .
              .
              .
              .
              .
              .
              .
              .
              .
              .
...............`;

const halo = String.raw`
                   ####
                  #    #
                  #    #
                   ####
 
 
 
 







  #`;

const prog = String.raw`
/* cc -O3 -DW=80 -DH=24 -Ddt=.01 -De=.5 -Du=.5 -Drpm=1000 -Dtilt=5 prog.c */#include<stdio.h>
/* ./a.out < prog.c  # or your favorite pattern file for a spinning top  */#include<unistd.h>
/**/char*C,B[H*W+9]="\x1b[H\x1b[J";typedef float S;typedef struct Q{S a[4];}Q;S*E,M,O,z,Z=71.
/8136*tilt,g,h=1;int i=1,j,k,a,b;struct P{Q x,v;S m;}L[1<<20],*p;void o(S*p){for(k=1;k<99;h*=
Z/k++)p[k%2]+=h=k%2?-h:h;}Q Y,w={{71*rpm/13560.}},  I[4],N={{1}},V,q,X={{30}},J,G;Q A(Q a,Q b
)/**/{for(k=4;k--;)a.a[k]+=b.a[k];return a;}Q m(Q  a,Q b){Q q=G;for(k=16;k--;){q.a[k%4]+=b.a[
k/4]*(1-(5432>>k&2))*a.a[19995>>(k>7?15-            k:k)*2&3];}return q;}void K(S x){for(h=k=
99;k;h=(x/h+h)/2)k--;}Q s(Q a,S b){J  .                a[3]=b;return m(a,J);}S D(Q a,Q b){for
(h=k=0;k<4/+1;k++){h+=a.a[k]*b.a[k]    ;}                return h;}Q U(Q a){K(D(a,a));h=1/+h;
return s(a,/**/h);}int main(){C=B+       6;o(           q. a+2);for(p=L;fgets(C,W*H-1,stdin);
b--){for(a=0/1;j=C[a++],j&&j!=47;)           {for(Z=0;j>   32&&Z*113<710;h=(a-.5+i*61e-7)/2,E
=(S*)p,M-=z/=j%2?2:2e3,*E=b,o(E+1),                        Y=A(Y,s(p->x,p->m=z)),p++,i=48271*
i%65535){Z/**/+=z=2./a;}}}for(;p-->                        L;)p->x=A(p->x,s(Y,1/M));for(;;us\
leep(1e4/1)){for(i=H*W;i--;C[i]=i>H*                     W-W?(a&16)+45 :i%W?32:10)a=i+O;for(j
=20;j--/1;){Q F={{M}},T=G,v=G,t[3]={                    G};for(p=L;p->m;p++){for(i=3,Y=p->x;i
--;t[/**/i].a[i]+=m(Y,Y).a[3]*p->m){t                [i]=A(t[i],s(Y,Y.a[i]*p->m));}}for(Z=i=0
;i<3/1;i++){Z-=D(t[i],I[i]=m(t[(i+1)%             3],t[(i+2)%3]));}for(;i--;I[i].a[3]=0){I[i]
=s/**/(I[i],3/Z);}for(p=L;p->m;p++){if         (E=p->v.a,(i=+W*(b=H-1.5-*E)+(a=.5+(E[1]-O)*2+
W/2))>0&&i<W*H&&0<a&&a<W){C[i]=E[2]<X.a[    2]&&C[i]-64?58:64;}}Z=0;E=v.a;for(p=L;p->m;p++){Q
r/**/=s(q,-1);r.a[3]*=-1;z=*(p->v=A(r=m(  m(q,p->x),r),X)).a;if(z<0){for(i=4;i--;){E[i]=D(I[i
/1],m(r,N));}g=(1+e)**A(V,m(w,r)).a/(*m  (v,r).a-1/M);v=A(V,m(w,r));*E=E[3]=0;F=A(F,v=A(s(N,g
/1*z-g),s(U                                                                       (v),g*u)));
/**/T=A(T,m                                                                       (r,v));Z=Z>
/**/z?z:Z;}                                                                       }*X.a-=Z;X=
/*IOCCC*/A(X,s(V=A(V,s(F,dt/-M)),dt));for(i=3;i--;)E[i]=D(I[i],T)*dt;q=U(A(q,s(m(w=A(w,v),q),
/*2025*/.5*dt)));}O+=(X.a[1]-O)/50;K(D(w,w)*36476);printf("%s\n%*.0f rpm",B,W-5,h);B[5]=72;}}`;

export const examples = [
  {label: 'Top', rpm: 1000, tilt: 5, text: top},
  {label: 'Top 2', rpm: 500, tilt: 5, text: top2},
  {label: 'Top 3', rpm: 500, tilt: 5, text: top3},
  {label: 'Top 4', rpm: 500, tilt: 5, text: top4},
  {label: 'Tippe Top', rpm: 2500, tilt: 5, text: tippeTop},
  {label: 'Tippe Top 2', rpm: 4000, tilt: 5, text: tippeTop2},
  {label: 'Tippe Top 3', rpm: 2500, tilt: 5, text: tippeTop3},
  {label: 'Bottle', rpm: 1000, tilt: 175, text: bottle},
  {label: 'Umbrella', rpm: 1000, tilt: 30, text: umbrella},
  {label: 'Vase', rpm: 2000, tilt: 20, text: vase},
  {label: 'Egg', rpm: 1300, tilt: 90, text: egg},
  {label: 'Stick', rpm: 10, tilt: 30, text: stick},
  {label: 'Cylinder', rpm: 500, tilt: 5, text: cylinder},
  {label: 'Halo', rpm: 300, tilt: 5, text: halo},
  {label: 'Prog', rpm: 1000, tilt: 5, text: prog},
];
